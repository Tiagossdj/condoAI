import fp from 'fastify-plugin'
import mqtt from 'mqtt'
import type { FastifyInstance } from 'fastify'
import {
  FimPayloadSchema,
  MqttPayloadSchema,
  StatusPayloadSchema,
  type MqttPayload,
  type StatusPayload,
} from '../schemas/index.js'

const TOPIC = 'condoai/deteccoes'
// Um tópico por câmera: o broker retém uma mensagem por tópico (spec 4.7)
const STATUS_PREFIX = 'condoai/status/'
const STATUS_TOPIC = `${STATUS_PREFIX}+`
const FIM_TOPIC = 'condoai/ocorrencias/fim'

// Fim vai para a ocorrência aberta mais recente do par (câmera, classe) que
// começou antes dele: um fim atrasado não fecha uma ocorrência mais nova (spec 4.4)
const UPDATE_FIM = `
  UPDATE deteccoes SET fim = $1
  WHERE id = (
    SELECT d.id
    FROM deteccoes d
    JOIN cameras c ON c.id = d.camera_id
    JOIN classes cl ON cl.id = d.classe_id
    WHERE c.camera_id = $2 AND cl.nome = $3
      AND d.fim IS NULL AND d.timestamp <= $1
    ORDER BY d.timestamp DESC
    LIMIT 1
  )
  RETURNING id
`

const INSERT_DETECCAO = `
  WITH ins AS (
    INSERT INTO deteccoes (timestamp, camera_id, classe_id, confianca, latencia_ms)
    SELECT $1, c.id, cl.id, $4, $5
    FROM cameras c, classes cl
    WHERE c.camera_id = $2 AND cl.nome = $3
    RETURNING id, camera_id
  )
  SELECT ins.id, c.localizacao
  FROM ins
  JOIN cameras c ON c.id = ins.camera_id
`

type InsertRow = {
  id: number
  localizacao: string
}

// Último sinal de vida de cada câmera, só em memória (spec 4.7 e 7.2)
type StatusCamera = { payload: StatusPayload; recebidoEm: number }

// Mesma regra do CameraStatus no dashboard (spec 8.2): offline após 30 s sem sinal
const SINAL_MAX_MS = 30_000

declare module 'fastify' {
  interface FastifyInstance {
    publishDeteccao: (payload: MqttPayload) => Promise<boolean>
    // Início da sessão de monitoramento da câmera, ou null se ela não está
    // monitorando agora (último status "online" há menos de 30 s) (spec 7.3)
    cameraOnlineDesde: (cameraId: string) => Date | null
  }
}

export default fp(
  async function mqttPlugin(fastify: FastifyInstance) {
    const host = process.env.MQTT_HOST ?? 'localhost'
    const port = Number(process.env.MQTT_PORT) || 1883

    // connect() (não connectAsync) para o backend subir mesmo com o broker fora (RNF08)
    const client = mqtt.connect(`mqtt://${host}:${port}`, { reconnectPeriod: 1000 })

    client.on('connect', () => {
      client.subscribe([TOPIC, STATUS_TOPIC, FIM_TOPIC], { qos: 1 }, (err) => {
        if (err) {
          fastify.log.error({ err }, 'falha ao assinar tópico MQTT')
          return
        }
        fastify.log.info({ topics: [TOPIC, STATUS_TOPIC, FIM_TOPIC] }, 'assinado nos tópicos MQTT')
      })
    })

    client.on('error', (err) => {
      fastify.log.error({ err }, 'erro no cliente MQTT')
    })

    client.on('message', (topic, message) => {
      if (topic.startsWith(STATUS_PREFIX)) {
        handleStatus(topic.slice(STATUS_PREFIX.length), message)
        return
      }
      if (topic === FIM_TOPIC) {
        handleFim(message).catch((err) => {
          fastify.log.error({ err }, 'falha ao processar fim de ocorrência')
        })
        return
      }
      handleMessage(message).catch((err) => {
        fastify.log.error({ err }, 'falha ao processar mensagem MQTT')
      })
    })

    function parseJson(message: Buffer): unknown {
      try {
        return JSON.parse(message.toString())
      } catch {
        fastify.log.warn('payload MQTT descartado: JSON inválido')
        return undefined
      }
    }

    const statusCameras = new Map<string, StatusCamera>()

    function statusEvento({ payload, recebidoEm }: StatusCamera) {
      return {
        camera_id: payload.camera_id,
        estado: payload.estado,
        modelo: payload.modelo,
        fps: payload.fps,
        ultimo_sinal: new Date(payload.timestamp).toISOString(),
        // Calculada no envio: o cliente não depende do relógio do dispositivo
        idade_s: Math.floor((Date.now() - recebidoEm) / 1000),
      }
    }

    function handleStatus(cameraTopico: string, message: Buffer) {
      // Mensagem vazia limpa o status retido no broker: nada a repassar
      if (message.length === 0) return

      const json = parseJson(message)
      if (json === undefined) return

      const parsed = StatusPayloadSchema.safeParse(json)
      if (!parsed.success) {
        fastify.log.warn({ issues: parsed.error.issues }, 'status MQTT descartado: schema inválido')
        return
      }
      if (parsed.data.camera_id !== cameraTopico) {
        fastify.log.warn(
          { topico: cameraTopico, camera_id: parsed.data.camera_id },
          'status MQTT descartado: camera_id difere do tópico',
        )
        return
      }

      const status = { payload: parsed.data, recebidoEm: Date.now() }
      statusCameras.set(parsed.data.camera_id, status)
      fastify.broadcast('status', statusEvento(status))
    }

    fastify.addSnapshot('status', () => [...statusCameras.values()].map(statusEvento))

    fastify.decorate('cameraOnlineDesde', (cameraId: string) => {
      const status = statusCameras.get(cameraId)
      if (status?.payload.estado !== 'online' || Date.now() - status.recebidoEm >= SINAL_MAX_MS) return null
      // Sem online_desde (main.py anterior à T32) não há como separar sessões: sem alerta
      return status.payload.online_desde ? new Date(status.payload.online_desde) : null
    })

    async function handleMessage(message: Buffer) {
      const json = parseJson(message)
      if (json === undefined) return

      const parsed = MqttPayloadSchema.safeParse(json)
      if (!parsed.success) {
        fastify.log.warn({ issues: parsed.error.issues }, 'payload MQTT descartado: schema inválido')
        return
      }

      await persistAndBroadcast(parsed.data)
    }

    async function handleFim(message: Buffer) {
      const json = parseJson(message)
      if (json === undefined) return

      const parsed = FimPayloadSchema.safeParse(json)
      if (!parsed.success) {
        fastify.log.warn({ issues: parsed.error.issues }, 'fim MQTT descartado: schema inválido')
        return
      }

      const { timestamp, camera_id, classe } = parsed.data
      const result = await fastify.db.query<{ id: number }>(UPDATE_FIM, [timestamp, camera_id, classe])
      const row = result.rows[0]
      if (!row) {
        fastify.log.warn({ camera_id, classe, timestamp }, 'fim MQTT descartado: nenhuma ocorrência aberta')
        return
      }
      fastify.log.info({ id: row.id, camera_id, classe, fim: timestamp }, 'fim de ocorrência registrado')
    }

    async function persistAndBroadcast(payload: MqttPayload) {
      const result = await fastify.db.query<InsertRow>(INSERT_DETECCAO, [
        payload.timestamp,
        payload.camera_id,
        payload.classe,
        payload.confianca,
        payload.latencia_ms,
      ])

      const row = result.rows[0]
      if (!row) {
        fastify.log.warn({ camera_id: payload.camera_id }, 'payload MQTT descartado: câmera não cadastrada')
        return
      }

      fastify.broadcast('deteccao', {
        id: row.id,
        timestamp: new Date(payload.timestamp).toISOString(),
        camera_id: payload.camera_id,
        classe: payload.classe,
        confianca: payload.confianca,
        localizacao: row.localizacao,
        latencia_ms: payload.latencia_ms,
      })
    }

    // Usado pelo POST /scan (spec 8.4): a detecção volta por este mesmo
    // subscriber e segue o caminho único persistência → WebSocket
    fastify.decorate('publishDeteccao', async (payload: MqttPayload) => {
      if (!client.connected) {
        fastify.log.warn('broker MQTT indisponível; detecção do /scan não publicada')
        return false
      }
      try {
        await client.publishAsync(TOPIC, JSON.stringify(payload), { qos: 1 })
        return true
      } catch (err) {
        fastify.log.error({ err }, 'falha ao publicar detecção no MQTT')
        return false
      }
    })

    fastify.addHook('onClose', async () => {
      await client.endAsync()
    })
  },
  { decorators: { fastify: ['db', 'broadcast', 'addSnapshot'] } },
)
