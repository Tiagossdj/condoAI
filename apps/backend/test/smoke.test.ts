// Smoke test de integração do pipeline completo (tarefa T21):
// POST /scan → inferência → MQTT → subscriber → Postgres → WebSocket → GET /deteccoes.
// Pré-requisitos: Docker (Postgres + Mosquitto), server.py (8000) e backend (3001) no ar.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { DeteccoesResponseSchema, ScanResponseSchema } from '../src/schemas/index.js'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001'
const CAMERA_ID = 'cam_test'
const WS_TIMEOUT_MS = 10_000

type EventoDeteccao = {
  id: number
  timestamp: string
  camera_id: string
  classe: string
  confianca: number
}

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const eventos: EventoDeteccao[] = []
const idsCriados: number[] = []
let ws: WebSocket

before(async () => {
  ws = new WebSocket(`${BACKEND_URL.replace(/^http/, 'ws')}/ws`)
  ws.addEventListener('message', (msg) => {
    const { event, data } = JSON.parse(String(msg.data)) as { event: string; data: EventoDeteccao }
    if (event === 'deteccao') eventos.push(data)
  })
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true })
    ws.addEventListener('error', () => reject(new Error('falha ao conectar no WebSocket')), { once: true })
  })
})

// Limpeza mesmo com falha: o smoke test não deixa linhas no banco
after(async () => {
  ws?.close()
  if (idsCriados.length > 0) {
    await db.query('DELETE FROM deteccoes WHERE id = ANY($1)', [idsCriados])
  }
  await db.end()
})

async function aguardarEvento(timestamp: string): Promise<EventoDeteccao> {
  const limite = Date.now() + WS_TIMEOUT_MS
  while (Date.now() < limite) {
    const evento = eventos.find((e) => e.timestamp === timestamp)
    if (evento) return evento
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`evento deteccao não recebido no WebSocket: ${timestamp}`)
}

test('GET /health responde ok', async () => {
  const res = await fetch(`${BACKEND_URL}/health`)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: 'ok' })
})

test('frame de papelão percorre /scan → MQTT → banco → WebSocket → GET /deteccoes', async () => {
  const frame = await readFile(new URL('./fixtures/papelao.jpg', import.meta.url))
  const form = new FormData()
  form.append('frame', new Blob([new Uint8Array(frame)], { type: 'image/jpeg' }), 'papelao.jpg')
  form.append('camera_id', CAMERA_ID)

  // 1. POST /scan: resposta top-1 no formato da spec 8.4
  const res = await fetch(`${BACKEND_URL}/scan`, { method: 'POST', body: form })
  assert.equal(res.status, 200)
  const scan = ScanResponseSchema.parse(await res.json())
  assert.equal(scan.classe, 'papelao')
  assert.ok(scan.confianca !== null && scan.confianca >= 0.4, `confiança abaixo do threshold: ${scan.confianca}`)

  // 2. WebSocket: o subscriber MQTT do backend persistiu e transmitiu (spec 7.2)
  const evento = await aguardarEvento(scan.timestamp)
  idsCriados.push(evento.id)
  assert.equal(evento.camera_id, CAMERA_ID)
  assert.equal(evento.classe, 'papelao')
  assert.equal(evento.confianca, scan.confianca)

  // 3. Banco: a linha existe com os mesmos dados
  const { rows } = await db.query<{ camera_id: string; classe: string; confianca: number }>(
    `SELECT c.camera_id, cl.nome AS classe, d.confianca::float8 AS confianca
     FROM deteccoes d
     JOIN cameras c ON c.id = d.camera_id
     JOIN classes cl ON cl.id = d.classe_id
     WHERE d.id = $1`,
    [evento.id],
  )
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { camera_id: CAMERA_ID, classe: 'papelao', confianca: scan.confianca })

  // 4. REST: a detecção aparece no histórico consumido pelo dashboard
  const lista = await fetch(`${BACKEND_URL}/deteccoes?camera_id=${CAMERA_ID}&classe=papelao&limite=10`)
  assert.equal(lista.status, 200)
  const { data } = DeteccoesResponseSchema.parse(await lista.json())
  assert.ok(data.some((d) => d.id === evento.id), `id ${evento.id} ausente em GET /deteccoes`)
})
