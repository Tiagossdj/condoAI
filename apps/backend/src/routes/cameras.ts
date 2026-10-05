import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { CameraSchema } from '../schemas/index.js'

export default async function camerasRoutes(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/cameras',
    {
      schema: {
        response: {
          200: z.array(CameraSchema),
        },
      },
    },
    async () => {
      const result = await fastify.db.query(
        `SELECT id, camera_id, localizacao
         FROM cameras
         WHERE ativo = true
         ORDER BY id`,
      )
      return result.rows
    },
  )
}
