// Smoke test de integração do pipeline completo (tarefa T21):
// POST /scan → inferência → MQTT → subscriber → Postgres → WebSocket → GET /deteccoes.
// Sinal de vida (T26): condoai/status/<camera_id> → backend → evento WebSocket "status" + snapshot.
// Painel (T28): GET /painel confere com contagens diretas no banco e com o fuso local.
// Fim e resolução (T31): condoai/ocorrencias/fim → deteccoes.fim; POST /deteccoes/:id/resolver.
// Pré-requisitos: Docker (Postgres + Mosquitto), server.py (8000) e backend (3001) no ar.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import mqtt from 'mqtt'
import {
  DeteccaoSchema,
  DeteccoesResponseSchema,
  PainelResponseSchema,
  ScanResponseSchema,
} from '../src/schemas/index.js'

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

test('GET /painel: agregados batem com o banco e as horas seguem o fuso local', async () => {
  const TZ = 'America/Sao_Paulo'
  for (const periodo of ['24h', '7d', '30d'] as const) {
    const res = await fetch(`${BACKEND_URL}/painel?periodo=${periodo}`)
    assert.equal(res.status, 200)
    const p = PainelResponseSchema.parse(await res.json())

    const { rows } = await db.query<{
      total_geral: number
      total_periodo: number
      hoje: number
      com_latencia: number
    }>(
      `SELECT count(*)::int AS total_geral,
              count(*) FILTER (WHERE timestamp >= $1)::int AS total_periodo,
              count(*) FILTER (WHERE (timestamp AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date)::int AS hoje,
              count(*) FILTER (WHERE timestamp >= $1 AND latencia_ms IS NOT NULL)::int AS com_latencia
       FROM deteccoes`,
      [p.de, TZ],
    )
    const banco = rows[0]!
    const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
    const somaClasses = (r: { saco_lixo: number; garrafa_pet: number; papelao: number; lixo_generico: number }) =>
      r.saco_lixo + r.garrafa_pet + r.papelao + r.lixo_generico

    // Uma detecção pode chegar entre a resposta e a consulta: tolera +1
    assert.ok(banco.total_geral - p.indicadores.total_geral <= 1, `${periodo}: total_geral`)
    assert.ok(banco.total_periodo - p.indicadores.total_periodo <= 1, `${periodo}: total_periodo`)
    assert.ok(banco.hoje - p.indicadores.hoje <= 1, `${periodo}: hoje`)
    assert.ok(banco.com_latencia - soma(p.latencia_hist.map((f) => f.total)) <= 1, `${periodo}: latencia_hist`)

    // Cada bloco soma o mesmo total do período
    const total = p.indicadores.total_periodo
    assert.equal(soma(p.serie.map(somaClasses)), total, `${periodo}: serie`)
    assert.equal(soma(p.por_classe.map((c) => c.total)), total, `${periodo}: por_classe`)
    assert.equal(soma(p.confianca_hist.map(somaClasses)), total, `${periodo}: confianca_hist`)
    assert.deepEqual(p.por_classe.map((c) => c.classe), ['saco_lixo', 'garrafa_pet', 'papelao', 'lixo_generico'])

    // Série completa e alinhada ao fuso local: 24 horas ou N dias, a última
    // começando na hora (ou dia) local atual
    assert.equal(p.serie.length, { '24h': 24, '7d': 7, '30d': 30 }[periodo])
    const partes = (d: Date) =>
      Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
          .formatToParts(d)
          .map((x) => [x.type, x.value]),
      )
    const ultima = partes(new Date(p.serie.at(-1)!.inicio))
    const agora = partes(new Date())
    assert.equal(ultima.minute, '00')
    assert.equal(ultima.day, agora.day)
    if (p.intervalo === 'hora') assert.equal(ultima.hour, agora.hour)
    else assert.equal(ultima.hour, '00')
    assert.equal(p.serie[0]!.inicio, p.de)
  }

  // ?de= no GET /deteccoes: nada anterior ao início do período
  const p24 = PainelResponseSchema.parse(await (await fetch(`${BACKEND_URL}/painel?periodo=24h`)).json())
  const lista = DeteccoesResponseSchema.parse(
    await (await fetch(`${BACKEND_URL}/deteccoes?limite=200&de=${encodeURIComponent(p24.de)}`)).json(),
  )
  assert.ok(lista.data.every((d) => d.timestamp >= p24.de), 'GET /deteccoes?de= devolveu detecção anterior ao período')

  // Período inválido → 400
  assert.equal((await fetch(`${BACKEND_URL}/painel?periodo=1h`)).status, 400)
})

test('fim e resolução: condoai/ocorrencias/fim → deteccoes.fim; POST /deteccoes/:id/resolver', async () => {
  // Horários em 2020: longe das ocorrências reais da cam_test, que nunca casam com estes fins
  const CLASSE = 'lixo_generico'
  const em = (s: number) => new Date(Date.UTC(2020, 0, 1, 0, 0, s)).toISOString()
  const client = await mqtt.connectAsync(MQTT_URL)

  async function ocorrencia(timestamp: string): Promise<number> {
    await client.publishAsync(
      'condoai/deteccoes',
      JSON.stringify({ timestamp, camera_id: CAMERA_ID, classe: CLASSE, confianca: 0.9, localizacao: 'smoke', latencia_ms: 1 }),
      { qos: 1 },
    )
    const { id } = await aguardarEvento(timestamp)
    idsCriados.push(id)
    return id
  }
  const fim = (timestamp: string) =>
    client.publishAsync('condoai/ocorrencias/fim', JSON.stringify({ timestamp, camera_id: CAMERA_ID, classe: CLASSE }), { qos: 1 })
  async function fimNoBanco(id: number): Promise<string | null> {
    const { rows } = await db.query<{ fim: Date | null }>('SELECT fim FROM deteccoes WHERE id = $1', [id])
    return rows[0]?.fim?.toISOString() ?? null
  }
  async function aguardarFim(id: number, esperado: string) {
    const limite = Date.now() + WS_TIMEOUT_MS
    while (Date.now() < limite) {
      if ((await fimNoBanco(id)) === esperado) return
      await new Promise((r) => setTimeout(r, 20))
    }
    assert.fail(`fim ${esperado} não gravado na detecção ${id} (atual: ${await fimNoBanco(id)})`)
  }
  const pausa = () => new Promise((r) => setTimeout(r, 300))

  try {
    // 1. Ocorrência + fim: fim gravado na linha certa
    const a = await ocorrencia(em(0))
    await fim(em(5))
    await aguardarFim(a, em(5))

    // 2. Fim sem ocorrência aberta anterior a ele: nada muda
    const { rows: antes } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM deteccoes WHERE fim IS NOT NULL')
    await fim(em(-3600))
    await pausa()
    const { rows: depois } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM deteccoes WHERE fim IS NOT NULL')
    assert.equal(depois[0]!.n, antes[0]!.n, 'fim sem ocorrência alterou alguma linha')

    // 3. Duas abertas do mesmo par (órfã + nova): o fim vai para a mais recente
    const orfa = await ocorrencia(em(100))
    const nova = await ocorrencia(em(160))
    await fim(em(170))
    await aguardarFim(nova, em(170))
    assert.equal(await fimNoBanco(orfa), null, 'a ocorrência mais antiga deveria continuar aberta')

    // 4. Fim anterior ao início da única aberta: não é aplicado
    const c = await ocorrencia(em(300))
    await fim(em(250))
    await pausa()
    assert.equal(await fimNoBanco(c), null, 'fim anterior ao início foi aplicado')
    // A regra é "aberta mais recente que começou antes do fim": aqui é a órfã (100 s)
    assert.equal(await fimNoBanco(orfa), em(250))

    // 5. POST /deteccoes/:id/resolver: 200, idempotente, 404 para id inexistente
    const r1 = await fetch(`${BACKEND_URL}/deteccoes/${a}/resolver`, { method: 'POST' })
    assert.equal(r1.status, 200)
    const d1 = DeteccaoSchema.parse(await r1.json())
    assert.ok(d1.resolvido_em, 'resolvido_em não preenchido')
    await new Promise((r) => setTimeout(r, 50))
    const d2 = DeteccaoSchema.parse(await (await fetch(`${BACKEND_URL}/deteccoes/${a}/resolver`, { method: 'POST' })).json())
    assert.equal(d2.resolvido_em, d1.resolvido_em, 'segunda chamada mudou resolvido_em')
    assert.equal((await fetch(`${BACKEND_URL}/deteccoes/2147483647/resolver`, { method: 'POST' })).status, 404)

    // 6. GET /deteccoes/:id traz fim e resolvido_em
    const g = DeteccaoSchema.parse(await (await fetch(`${BACKEND_URL}/deteccoes/${a}`)).json())
    assert.equal(g.fim, em(5))
    assert.equal(g.resolvido_em, d1.resolvido_em)
    const aberta = DeteccaoSchema.parse(await (await fetch(`${BACKEND_URL}/deteccoes/${c}`)).json())
    assert.equal(aberta.fim, null)
    assert.equal(aberta.resolvido_em, null)
  } finally {
    await client.endAsync()
  }
})
