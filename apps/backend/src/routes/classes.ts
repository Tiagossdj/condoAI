import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { ClasseSchema } from '../schemas/index.js'

export default async function classesRoutes(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/classes',
    {
      schema: {
        response: {
          200: z.array(ClasseSchema),
        },
      },
    },
    async () => {
      const result = await fastify.db.query(
        `SELECT id, nome
         FROM classes
         ORDER BY id`,
      )
      return result.rows
    },
  )
}
