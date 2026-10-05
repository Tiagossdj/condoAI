import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import {
  ErrorResponseSchema,
  PredictResponseSchema,
  ScanResponseSchema,
  type MqttPayload,
} from '../schemas/index.js'

const INFERENCE_TIMEOUT_MS = 10_000

type Frame = {
  buffer: Buffer
  mimetype: string
  filename: string
}

// POST /scan (spec 8.4): frame do frontend → POST /predict (spec 4.5)
// → top-1 → publica no MQTT → responde
export default async function scanRoutes(fastify: FastifyInstance) {
  const inferenceUrl = process.env.INFERENCE_URL ?? 'http://localhost:8000'

  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/scan',
    {
      schema: {
        response: {
          200: ScanResponseSchema,
          400: ErrorResponseSchema,
          502: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const t0 = performance.now()
      const timestamp = new Date().toISOString()

      if (!request.isMultipart()) {
        return reply.code(400).send({ error: 'esperado multipart/form-data' })
      }

      // parts() em vez de file(): aceita camera_id antes ou depois do frame
      let frame: Frame | undefined
      let cameraId: string | undefined
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer()
          if (part.fieldname === 'frame' && !frame) {
            frame = { buffer, mimetype: part.mimetype, filename: part.filename }
          }
        } else if (part.fieldname === 'camera_id') {
          cameraId = String(part.value)
        }
      }

      if (!frame || frame.buffer.length === 0) {
        return reply.code(400).send({ error: 'campo frame ausente' })
      }
      if (!cameraId) {
        return reply.code(400).send({ error: 'campo camera_id ausente' })
      }

      const camera = await fastify.db.query<{ localizacao: string }>(
        'SELECT localizacao FROM cameras WHERE camera_id = $1 AND ativo = true',
        [cameraId],
      )
      const localizacao = camera.rows[0]?.localizacao
      if (localizacao === undefined) {
        return reply.code(400).send({ error: `câmera não cadastrada: ${cameraId}` })
      }

      // O frame só trafega em memória até o serviço de inferência (spec 5)
      const form = new FormData()
      form.append(
        'frame',
        new Blob([new Uint8Array(frame.buffer)], { type: frame.mimetype }),
        frame.filename || 'frame.jpg',
      )

      let deteccoes
      try {
        const res = await fetch(`${inferenceUrl}/predict`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
        })
        if (res.status === 400) {
          return reply.code(400).send({ error: 'imagem inválida' })
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        deteccoes = PredictResponseSchema.parse(await res.json()).deteccoes
      } catch (err) {
        request.log.error({ err }, 'falha ao chamar o serviço de inferência')
        return reply.code(502).send({ error: 'serviço de inferência indisponível' })
      }

      const top = deteccoes.reduce<(typeof deteccoes)[number] | undefined>(
        (best, d) => (!best || d.confianca > best.confianca ? d : best),
        undefined,
      )

      if (!top) {
        return {
          classe: null,
          confianca: null,
          bbox: null,
          latencia_ms: Math.round(performance.now() - t0),
          timestamp,
        }
      }

      const payload: MqttPayload = {
        timestamp,
        camera_id: cameraId,
        classe: top.classe,
        confianca: top.confianca,
        localizacao,
        latencia_ms: Math.round(performance.now() - t0),
      }
      await fastify.publishDeteccao(payload)

      return {
        classe: top.classe,
        confianca: top.confianca,
        bbox: top.bbox,
        latencia_ms: payload.latencia_ms,
        timestamp,
      }
    },
  )
}
