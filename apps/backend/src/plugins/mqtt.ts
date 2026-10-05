import fp from 'fastify-plugin'
import mqtt from 'mqtt'
import type { FastifyInstance } from 'fastify'
import { MqttPayloadSchema, type MqttPayload } from '../schemas/index.js'

const TOPIC = 'condoai/deteccoes'

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

declare module 'fastify' {
  interface FastifyInstance {
    publishDeteccao: (payload: MqttPayload) => Promise<boolean>
  }
}

export default fp(
  async function mqttPlugin(fastify: FastifyInstance) {
    const host = process.env.MQTT_HOST ?? 'localhost'
    const port = Number(process.env.MQTT_PORT) || 1883

    // connect() (não connectAsync) para o backend subir mesmo com o broker fora (RNF08)
    const client = mqtt.connect(`mqtt://${host}:${port}`, { reconnectPeriod: 1000 })

    client.on('connect', () => {
      client.subscribe(TOPIC, { qos: 1 }, (err) => {
        if (err) {
          fastify.log.error({ err }, 'falha ao assinar tópico MQTT')
          return
        }
        fastify.log.info({ topic: TOPIC }, 'assinado no tópico MQTT')
      })
    })

    client.on('error', (err) => {
      fastify.log.error({ err }, 'erro no cliente MQTT')
    })

    client.on('message', (_topic, message) => {
      handleMessage(message).catch((err) => {
        fastify.log.error({ err }, 'falha ao processar mensagem MQTT')
      })
    })

    async function handleMessage(message: Buffer) {
      let json: unknown
      try {
        json = JSON.parse(message.toString())
      } catch {
        fastify.log.warn('payload MQTT descartado: JSON inválido')
        return
      }

      const parsed = MqttPayloadSchema.safeParse(json)
      if (!parsed.success) {
        fastify.log.warn({ issues: parsed.error.issues }, 'payload MQTT descartado: schema inválido')
        return
      }

      await persistAndBroadcast(parsed.data)
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
  { decorators: { fastify: ['db', 'broadcast'] } },
)
