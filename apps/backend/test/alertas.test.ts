// Teste do alerta escalonado ao gestor (tarefa T32, spec 7.3).
// Pré-requisitos: Docker (Postgres + Mosquitto + ntfy) e o backend no ar com
// limites acelerados, por exemplo:
//   ALERTA_LIMITES_S=2,4,6 ALERTA_VERIFICACAO_S=1 NTFY_URL=http://localhost:8080
//   BACKEND_URL_LAN=http://localhost:3001
// Lê os alertas pela API do ntfy (GET /<tópico>/json?poll=1). Cria câmeras
// temporárias e remove tudo o que criou ao final.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import mqtt, { type MqttClient } from 'mqtt'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001'
const NTFY_URL = process.env.NTFY_URL ?? 'http://localhost:8080'
const TOPICO = process.env.NTFY_TOPICO ?? 'condoai-alertas'
const MQTT_URL = `mqtt://${process.env.MQTT_HOST ?? 'localhost'}:${process.env.MQTT_PORT ?? 1883}`
const LIMITES_S = [2, 4, 6] // devem bater com o ALERTA_LIMITES_S do backend

const CAM_ONLINE = 'cam_smoke_alerta'
const CAM_OFFLINE = 'cam_smoke_offline'
const CAM_SESSAO = 'cam_smoke_sessao' // sessão começou agora; ocorrência é de antes
const CAM_COLETA = 'cam_test' // ponto_coleta (seed)

type Acao = { action: string; label: string; url: string; method?: string; headers?: Record<string, string>; body?: string; clear?: boolean }
type Alerta = {
  id: string
  time: number
  title: string
  message: string
  priority?: number
  actions?: Acao[]
  attachment?: unknown
  sequence_id?: string
}

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const inicio = Math.floor(Date.now() / 1000)
const idsCriados: number[] = []
let client: MqttClient
let sinal: NodeJS.Timeout
// Início da sessão de monitoramento (spec 4.7): 200 s atrás, para a órfã do
// último teste ser da sessão atual e exercitar a regra da mais recente do par
const SESSAO = new Date(Date.now() - 200_000).toISOString()
const SESSAO_NOVA = new Date().toISOString()

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

function status(cameraId: string, estado: 'online' | 'offline', onlineDesde = SESSAO) {
  return client.publishAsync(
    `condoai/status/${cameraId}`,
    JSON.stringify({
      camera_id: cameraId,
      timestamp: new Date().toISOString(),
      estado,
      modelo: 'smoke',
      fps: estado === 'online' ? 30 : null,
      online_desde: estado === 'online' ? onlineDesde : null,
    }),
    { qos: 1 },
  )
}

async function ocorrencia(cameraId: string, classe: string, timestamp = new Date().toISOString()): Promise<number> {
  await client.publishAsync(
    'condoai/deteccoes',
    JSON.stringify({ timestamp, camera_id: cameraId, classe, confianca: 0.9, localizacao: 'smoke', latencia_ms: 1 }),
    { qos: 1 },
  )
  const limite = Date.now() + 10_000
  while (Date.now() < limite) {
    const { rows } = await db.query<{ id: number }>(
      `SELECT d.id FROM deteccoes d JOIN cameras c ON c.id = d.camera_id JOIN classes cl ON cl.id = d.classe_id
       WHERE c.camera_id = $1 AND cl.nome = $2 AND d.timestamp = $3`,
      [cameraId, classe, timestamp],
    )
    if (rows[0]) {
      idsCriados.push(rows[0].id)
      return rows[0].id
    }
    await dormir(20)
  }
  throw new Error(`ocorrência não persistida: ${cameraId} ${classe} ${timestamp}`)
}

function fim(cameraId: string, classe: string, timestamp: string) {
  return client.publishAsync('condoai/ocorrencias/fim', JSON.stringify({ timestamp, camera_id: cameraId, classe }), { qos: 1 })
}

// Alertas do tópico desde o início do teste cujo botão aponta para a ocorrência
async function alertas(id: number): Promise<Alerta[]> {
  const res = await fetch(`${NTFY_URL}/${TOPICO}/json?poll=1&since=${inicio}`)
  assert.equal(res.status, 200)
  const linhas = (await res.text()).split('\n').filter(Boolean)
  return linhas
    .map((l) => JSON.parse(l) as Alerta & { event: string })
    .filter((m) => m.event === 'message' && m.actions?.some((a) => a.url.endsWith(`/deteccoes/${id}/resolver`)))
}

// Tudo o que saiu na notificação da ocorrência (alertas + confirmação)
async function notificacoes(id: number): Promise<Alerta[]> {
  const res = await fetch(`${NTFY_URL}/${TOPICO}/json?poll=1&since=${inicio}`)
  const linhas = (await res.text()).split('\n').filter(Boolean)
  return linhas
    .map((l) => JSON.parse(l) as Alerta & { event: string })
    .filter((m) => m.event === 'message' && m.sequence_id === `ocorrencia-${id}`)
}

async function aguardarAlertas(id: number, n: number, timeoutMs = 10_000): Promise<Alerta[]> {
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    const lista = await alertas(id)
    if (lista.length >= n) return lista
    await dormir(200)
  }
  return alertas(id)
}

before(async () => {
  for (const cam of [CAM_ONLINE, CAM_OFFLINE, CAM_SESSAO]) {
    await db.query(
      `INSERT INTO cameras (camera_id, localizacao, tipo_area) VALUES ($1, $2, 'zona_proibida')
       ON CONFLICT (camera_id) DO NOTHING`,
      [cam, cam.replace('cam_', '')],
    )
  }
  client = await mqtt.connectAsync(MQTT_URL)
  // Sinal de vida a cada 5 s, como o main.py faz a cada 10 s (spec 4.7)
  const renovar = () =>
    Promise.all([
      status(CAM_ONLINE, 'online'),
      status(CAM_COLETA, 'online'),
      status(CAM_OFFLINE, 'offline'),
      status(CAM_SESSAO, 'online', SESSAO_NOVA),
    ])
  await renovar()
  sinal = setInterval(() => void renovar(), 5_000)
  await dormir(200)
})

after(async () => {
  clearInterval(sinal)
  await status(CAM_COLETA, 'offline')
  await status(CAM_ONLINE, 'offline')
  await status(CAM_SESSAO, 'offline')
  await client.endAsync()
  if (idsCriados.length) await db.query('DELETE FROM deteccoes WHERE id = ANY($1)', [idsCriados])
  await db.query(
    `DELETE FROM deteccoes WHERE camera_id IN (SELECT id FROM cameras WHERE camera_id = ANY($1))`,
    [[CAM_ONLINE, CAM_OFFLINE, CAM_SESSAO]],
  )
  await db.query('DELETE FROM cameras WHERE camera_id = ANY($1)', [[CAM_ONLINE, CAM_OFFLINE, CAM_SESSAO]])
  await db.end()
})

test('alerta escalonado: um alerta por limite, prioridade crescente, sem imagem', async () => {
  const id = await ocorrencia(CAM_ONLINE, 'saco_lixo')
  const criadaEm = Date.now() / 1000

  const lista = await aguardarAlertas(id, LIMITES_S.length, 12_000)
  await dormir(2_500) // limites esgotados: não pode chegar um quarto
  const finais = await alertas(id)
  assert.equal(finais.length, LIMITES_S.length, `esperados ${LIMITES_S.length} alertas, recebidos ${finais.length}`)
  assert.equal(lista.length, LIMITES_S.length)

  finais.sort((a, b) => a.time - b.time)
  assert.deepEqual(finais.map((a) => a.priority), [3, 4, 5])
  finais.forEach((a, i) => {
    // time do ntfy em segundos inteiros: tolera 1 s de arredondamento
    assert.ok(a.time - criadaEm >= LIMITES_S[i]! - 1, `alerta ${i + 1} antes do limite (${a.time - criadaEm} s)`)
    assert.equal(a.title, 'condoAI · resíduo em zona proibida')
    assert.match(a.message, /^saco_lixo em smoke_alerta há \d+ s$/)
    assert.equal(a.attachment, undefined, 'alerta não pode ter anexo (spec 5)')
    const [acao] = a.actions!
    assert.deepEqual(
      { action: acao!.action, label: acao!.label, url: acao!.url, method: acao!.method, body: acao!.body, clear: acao!.clear },
      { action: 'http', label: 'Resolvido', url: `${BACKEND_URL}/deteccoes/${id}/resolver`, method: 'POST', body: '{}', clear: true },
    )
    assert.equal(acao!.headers?.['Content-Type'], 'application/json')
    // Mesma notificação: cada alerta substitui o anterior no celular
    assert.equal(a.sequence_id, `ocorrencia-${id}`)
  })

  const { rows } = await db.query<{ alertas_enviados: number }>('SELECT alertas_enviados FROM deteccoes WHERE id = $1', [id])
  assert.equal(rows[0]!.alertas_enviados, LIMITES_S.length)
})

test('botão "Resolvido" (mesma requisição do ntfy) grava resolvido_em e interrompe os alertas', async () => {
  const id = await ocorrencia(CAM_ONLINE, 'garrafa_pet')
  const [primeiro] = await aguardarAlertas(id, 1)
  assert.ok(primeiro, 'primeiro alerta não chegou')

  const acao = primeiro.actions![0]!
  const res = await fetch(acao.url, { method: acao.method, headers: acao.headers, body: acao.body })
  assert.equal(res.status, 200)
  // Clique repetido (o gestor não viu retorno): 200, sem nova confirmação
  const repetido = await fetch(acao.url, { method: acao.method, headers: acao.headers, body: acao.body })
  assert.equal(repetido.status, 200)
  const { rows } = await db.query<{ resolvido_em: Date | null }>('SELECT resolvido_em FROM deteccoes WHERE id = $1', [id])
  assert.ok(rows[0]!.resolvido_em, 'resolvido_em não gravado')

  await dormir((LIMITES_S.at(-1)! + 1.5) * 1000)
  assert.equal((await alertas(id)).length, 1, 'alertas continuaram depois do "Resolvido"')

  // Confirmação no celular: uma só, na mesma notificação, sem botão
  const confirmacoes = (await notificacoes(id)).filter((m) => m.title === 'condoAI · resolvido')
  assert.equal(confirmacoes.length, 1, `esperada 1 confirmação, recebidas ${confirmacoes.length}`)
  const [conf] = confirmacoes
  assert.match(conf!.message, /^✔ garrafa_pet em smoke_alerta resolvida às \d{2}:\d{2} \(\d+ s após a detecção\)$/)
  assert.equal(conf!.actions, undefined, 'confirmação não deve ter botão')
  assert.equal(conf!.priority, 2)
})

test('não alertam: encerrada, câmera offline, ponto de coleta, órfã com sucessora encerrada e anterior à sessão', async () => {
  const agora = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  // Encerrada logo depois de começar
  const encerrada = await ocorrencia(CAM_ONLINE, 'papelao', iso(agora))
  await fim(CAM_ONLINE, 'papelao', iso(agora + 500))
  // Câmera de zona proibida, mas offline
  const offline = await ocorrencia(CAM_OFFLINE, 'saco_lixo', iso(agora))
  // Ponto de coleta (cam_test), online
  const coleta = await ocorrencia(CAM_COLETA, 'lixo_generico', iso(agora))
  // Órfã aberta há 100 s; a sucessora do mesmo par já foi encerrada
  const orfa = await ocorrencia(CAM_ONLINE, 'lixo_generico', iso(agora - 100_000))
  const sucessora = await ocorrencia(CAM_ONLINE, 'lixo_generico', iso(agora - 50_000))
  await fim(CAM_ONLINE, 'lixo_generico', iso(agora - 40_000))
  // Aberta, mas de antes da sessão atual da câmera (ex.: demonstração de 9/10)
  const antiga = await ocorrencia(CAM_SESSAO, 'saco_lixo', iso(agora - 60_000))

  await dormir((LIMITES_S.at(-1)! + 1.5) * 1000)

  const { rows } = await db.query<{ id: number; fim: Date | null }>('SELECT id, fim FROM deteccoes WHERE id = ANY($1)', [[orfa, sucessora]])
  assert.equal(rows.find((r) => r.id === sucessora)?.fim?.toISOString(), iso(agora - 40_000), 'fim não foi para a sucessora')
  assert.equal(rows.find((r) => r.id === orfa)?.fim, null, 'a órfã deveria continuar aberta')

  for (const [nome, id] of Object.entries({ encerrada, offline, coleta, orfa, sucessora, antiga })) {
    assert.equal((await alertas(id)).length, 0, `${nome} (id ${id}) gerou alerta`)
  }
})
