// Smoke test de integração do pipeline completo (tarefa T21):
// POST /scan → inferência → MQTT → subscriber → Postgres → WebSocket → GET /deteccoes.
// Sinal de vida (T26): condoai/status/<camera_id> → backend → evento WebSocket "status" + snapshot.
// Pré-requisitos: Docker (Postgres + Mosquitto), server.py (8000) e backend (3001) no ar.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import mqtt from 'mqtt'
import { DeteccoesResponseSchema, ScanResponseSchema } from '../src/schemas/index.js'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001'
const CAMERA_ID = 'cam_test'
const WS_TIMEOUT_MS = 10_000
const MQTT_URL = `mqtt://${process.env.MQTT_HOST ?? 'localhost'}:${process.env.MQTT_PORT ?? 1883}`

type EventoDeteccao = {
  id: number
  timestamp: string
  camera_id: string
  classe: string
  confianca: number
}

type EventoStatus = {
  camera_id: string
  estado: string
  modelo: string
  fps: number | null
  ultimo_sinal: string
  idade_s: number
}

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const eventos: EventoDeteccao[] = []
const eventosStatus: EventoStatus[] = []
const idsCriados: number[] = []
let ws: WebSocket

before(async () => {
  ws = new WebSocket(`${BACKEND_URL.replace(/^http/, 'ws')}/ws`)
  ws.addEventListener('message', (msg) => {
    const { event, data } = JSON.parse(String(msg.data)) as { event: string; data: unknown }
    if (event === 'deteccao') eventos.push(data as EventoDeteccao)
    if (event === 'status') eventosStatus.push(data as EventoStatus)
  })
  await abrir(ws)
})

function abrir(socket: WebSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('falha ao conectar no WebSocket')), { once: true })
  })
}

async function aguardar<T>(lista: T[], pred: (e: T) => boolean, descricao: string): Promise<T> {
  const limite = Date.now() + WS_TIMEOUT_MS
  while (Date.now() < limite) {
    const evento = lista.find(pred)
    if (evento) return evento
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`evento não recebido no WebSocket: ${descricao}`)
}

// Limpeza mesmo com falha: o smoke test não deixa linhas no banco
after(async () => {
  ws?.close()
  if (idsCriados.length > 0) {
    await db.query('DELETE FROM deteccoes WHERE id = ANY($1)', [idsCriados])
  }
  await db.end()
})

function aguardarEvento(timestamp: string): Promise<EventoDeteccao> {
  return aguardar(eventos, (e) => e.timestamp === timestamp, `deteccao ${timestamp}`)
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

test('sinal de vida: condoai/status/<camera_id> → evento WebSocket "status" + snapshot na conexão', async () => {
  const client = await mqtt.connectAsync(MQTT_URL)
  const publicar = (estado: 'online' | 'offline', timestamp: string) =>
    client.publishAsync(
      `condoai/status/${CAMERA_ID}`,
      JSON.stringify({ camera_id: CAMERA_ID, timestamp, estado, modelo: 'smoke', fps: estado === 'online' ? 30 : null }),
      { qos: 1, retain: true },
    )

  try {
    // 1. Broadcast: o cliente já conectado recebe o status (spec 7.2)
    const online = new Date().toISOString()
    await publicar('online', online)
    const evento = await aguardar(eventosStatus, (e) => e.ultimo_sinal === online, `status ${online}`)
    assert.equal(evento.camera_id, CAMERA_ID)
    assert.equal(evento.estado, 'online')
    assert.equal(evento.fps, 30)
    assert.ok(evento.idade_s >= 0 && evento.idade_s <= 1, `idade_s inesperada: ${evento.idade_s}`)

    // 2. Snapshot: um cliente novo recebe o estado atual assim que conecta
    const recebidos: EventoStatus[] = []
    const novo = new WebSocket(`${BACKEND_URL.replace(/^http/, 'ws')}/ws`)
    novo.addEventListener('message', (msg) => {
      const { event, data } = JSON.parse(String(msg.data)) as { event: string; data: EventoStatus }
      if (event === 'status') recebidos.push(data)
    })
    await abrir(novo)
    try {
      const snap = await aguardar(recebidos, (e) => e.camera_id === CAMERA_ID, 'snapshot de status')
      assert.equal(snap.estado, 'online')
      assert.equal(snap.ultimo_sinal, online)
    } finally {
      novo.close()
    }

    // 3. Descartados (nenhum evento novo): payload fora do schema e camera_id
    //    diferente do sufixo do tópico
    const antes = eventosStatus.length
    await client.publishAsync(`condoai/status/${CAMERA_ID}`, JSON.stringify({ camera_id: CAMERA_ID, estado: 'talvez' }), { qos: 1 })
    await client.publishAsync(
      'condoai/status/cam_outra',
      JSON.stringify({ camera_id: CAMERA_ID, timestamp: online, estado: 'online', modelo: 'smoke', fps: 30 }),
      { qos: 1 },
    )
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(eventosStatus.length, antes)
  } finally {
    // Deixa a câmera de teste como offline (o status fica retido no broker)
    await publicar('offline', new Date().toISOString())
    await client.endAsync()
  }
})
