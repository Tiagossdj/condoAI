// Medição da latência do pipeline (H2, tarefa T20):
// POST /scan → inferência → MQTT → subscriber → Postgres → broadcast WebSocket.
// Uso: npm run latencia -- <caminho/do/frame.jpg> [amostras]
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001'
const CAMERA_ID = 'cam_test'
const AQUECIMENTO = 3
const WS_TIMEOUT_MS = 10_000

type ScanResponse = {
  classe: string | null
  confianca: number | null
  latencia_ms: number
  timestamp: string
}

type Amostra = {
  total_ms: number
  backend_ms: number
  id: number
}

const [framePath, amostrasArg] = process.argv.slice(2)
if (!framePath) {
  console.error('uso: npm run latencia -- <caminho/do/frame.jpg> [amostras]')
  process.exit(1)
}
const N = Number(amostrasArg ?? 50)
const frame = await readFile(framePath)

// Eventos `deteccao` indexados pelo timestamp: o evento do WS pode chegar
// antes ou depois da resposta HTTP do /scan
const eventos = new Map<string, { t: number; id: number }>()
const esperando = new Map<string, (e: { t: number; id: number }) => void>()

const ws = new WebSocket(`${BACKEND_URL.replace(/^http/, 'ws')}/ws`)
ws.addEventListener('message', (msg) => {
  const t = performance.now()
  const { event, data } = JSON.parse(String(msg.data)) as {
    event: string
    data: { id: number; timestamp: string }
  }
  if (event !== 'deteccao') return
  const e = { t, id: data.id }
  const resolve = esperando.get(data.timestamp)
  if (resolve) resolve(e)
  else eventos.set(data.timestamp, e)
})
await new Promise<void>((resolve, reject) => {
  ws.addEventListener('open', () => resolve(), { once: true })
  ws.addEventListener('error', () => reject(new Error('falha ao conectar no WebSocket')), {
    once: true,
  })
})

function aguardarEvento(timestamp: string): Promise<{ t: number; id: number }> {
  const pronto = eventos.get(timestamp)
  if (pronto) return Promise.resolve(pronto)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`evento WS não recebido: ${timestamp}`)), WS_TIMEOUT_MS)
    esperando.set(timestamp, (e) => {
      clearTimeout(timer)
      resolve(e)
    })
  })
}

async function medir(): Promise<Amostra> {
  const form = new FormData()
  form.append('frame', new Blob([new Uint8Array(frame)], { type: 'image/jpeg' }), basename(framePath!))
  form.append('camera_id', CAMERA_ID)

  const t0 = performance.now()
  const res = await fetch(`${BACKEND_URL}/scan`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`POST /scan → HTTP ${res.status}: ${await res.text()}`)
  const scan = (await res.json()) as ScanResponse
  if (scan.classe === null) throw new Error('frame sem detecção: escolha outra imagem')

  const evento = await aguardarEvento(scan.timestamp)
  return { total_ms: evento.t - t0, backend_ms: scan.latencia_ms, id: evento.id }
}

function percentil(ordenado: number[], p: number): number {
  // Método nearest-rank
  const i = Math.max(0, Math.ceil((p / 100) * ordenado.length) - 1)
  return ordenado[i]!
}

function resumo(valores: number[]) {
  const v = [...valores].sort((a, b) => a - b)
  const media = v.reduce((s, x) => s + x, 0) / v.length
  return {
    min: v[0]!,
    mediana: v.length % 2 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2,
    media,
    p95: percentil(v, 95),
    max: v[v.length - 1]!,
  }
}

const ids: number[] = []
for (let i = 0; i < AQUECIMENTO; i++) ids.push((await medir()).id)

const amostras: Amostra[] = []
for (let i = 0; i < N; i++) {
  const a = await medir()
  amostras.push(a)
  ids.push(a.id)
}
ws.close()

const fmt = (x: number) => x.toFixed(1).padStart(8)
console.log(`\nframe: ${basename(framePath)} (${frame.length} bytes) · ${N} amostras (+${AQUECIMENTO} de aquecimento)\n`)
console.log('| trecho                                   |      mín |  mediana |    média |      P95 |      máx |')
console.log('|------------------------------------------|----------|----------|----------|----------|----------|')
for (const [nome, valores] of [
  ['total: /scan → evento WebSocket (ms)', amostras.map((a) => a.total_ms)],
  ['backend: chegada → publicação MQTT (ms)', amostras.map((a) => a.backend_ms)],
  ['MQTT → Postgres → WS + HTTP (ms)', amostras.map((a) => a.total_ms - a.backend_ms)],
] as const) {
  const r = resumo(valores)
  console.log(`| ${nome.padEnd(40)} | ${fmt(r.min)} | ${fmt(r.mediana)} | ${fmt(r.media)} | ${fmt(r.p95)} | ${fmt(r.max)} |`)
}
console.log(`\nids gravados: ${Math.min(...ids)}–${Math.max(...ids)} (${ids.length} linhas)`)
