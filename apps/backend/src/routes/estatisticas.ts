import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { z } from 'zod'
import { EstatisticasResponseSchema, type ClasseNomeSchema } from '../schemas/index.js'

type ContagemRow = {
  classe: z.infer<typeof ClasseNomeSchema>
  total: number
  ultimo_id: number | null
}

// Contagem por classe para o StatsBar (spec 7.1): LEFT JOIN para que as
// classes sem detecção apareçam com zero, na ordem da seção 3.2. O MAX(id)
// vem na mesma consulta (mesmo snapshot) que as contagens
export default async function estatisticasRoutes(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/estatisticas',
    {
      schema: {
        response: {
          200: EstatisticasResponseSchema,
        },
      },
    },
    async () => {
      const result = await fastify.db.query<ContagemRow>(
        `SELECT cl.nome AS classe,
                COUNT(d.id)::int AS total,
                (SELECT MAX(id) FROM deteccoes) AS ultimo_id
         FROM classes cl
         LEFT JOIN deteccoes d ON d.classe_id = cl.id
         GROUP BY cl.id, cl.nome
         ORDER BY cl.id`,
      )

      const por_classe = result.rows.map(({ classe, total }) => ({ classe, total }))
      const total = por_classe.reduce((soma, row) => soma + row.total, 0)
      const ultimo_id = result.rows[0]?.ultimo_id ?? null
      return { total, ultimo_id, por_classe }
    },
  )
}
