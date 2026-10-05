import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import {
  DeteccaoIdParamsSchema,
  DeteccaoSchema,
  DeteccoesQuerySchema,
  DeteccoesResponseSchema,
  ErrorResponseSchema,
} from '../schemas/index.js'

const SELECT_DETECCAO = `
  SELECT
    d.id,
    d.timestamp,
    d.confianca,
    d.latencia_ms,
    c.id   AS camera_id_pk,
    c.camera_id,
    c.localizacao,
    cl.id  AS classe_id_pk,
    cl.nome AS classe_nome
  FROM deteccoes d
  JOIN cameras c ON c.id = d.camera_id
  JOIN classes cl ON cl.id = d.classe_id
`

type DeteccaoRow = {
  id: number
  timestamp: Date
  confianca: string
  latencia_ms: number | null
  camera_id_pk: number
  camera_id: string
  localizacao: string
  classe_id_pk: number
  classe_nome: string
}

function toDeteccao(row: DeteccaoRow) {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    camera: {
      id: row.camera_id_pk,
      camera_id: row.camera_id,
      localizacao: row.localizacao,
    },
    classe: {
      id: row.classe_id_pk,
      nome: row.classe_nome,
    },
    confianca: Number(row.confianca),
    latencia_ms: row.latencia_ms,
  }
}

export default async function deteccoesRoutes(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/deteccoes',
    {
      schema: {
        querystring: DeteccoesQuerySchema,
        response: {
          200: DeteccoesResponseSchema,
        },
      },
    },
    async (request) => {
      const { limite, cursor, camera_id, classe } = request.query

      const conditions: string[] = []
      const params: unknown[] = []

      if (cursor) {
        params.push(cursor)
        conditions.push(`d.timestamp < $${params.length}`)
      }
      if (camera_id) {
        params.push(camera_id)
        conditions.push(`c.camera_id = $${params.length}`)
      }
      if (classe) {
        params.push(classe)
        conditions.push(`cl.nome = $${params.length}`)
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      params.push(limite + 1)

      const result = await fastify.db.query<DeteccaoRow>(
        `${SELECT_DETECCAO}
         ${where}
         ORDER BY d.timestamp DESC
         LIMIT $${params.length}`,
        params,
      )

      const hasMore = result.rows.length > limite
      const rows = hasMore ? result.rows.slice(0, limite) : result.rows
      const data = rows.map(toDeteccao)
      const next_cursor = hasMore ? rows[rows.length - 1]!.timestamp.toISOString() : null

      return { data, next_cursor }
    },
  )

  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/deteccoes/:id',
    {
      schema: {
        params: DeteccaoIdParamsSchema,
        response: {
          200: DeteccaoSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params

      const result = await fastify.db.query<DeteccaoRow>(
        `${SELECT_DETECCAO} WHERE d.id = $1`,
        [id],
      )

      const row = result.rows[0]
      if (!row) {
        return reply.code(404).send({ error: 'detecção não encontrada' })
      }

      return toDeteccao(row)
    },
  )
}
