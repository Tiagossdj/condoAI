import fp from 'fastify-plugin'
import { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool
  }
}

export default fp(async function dbPlugin(fastify: FastifyInstance) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  await pool.query('SELECT 1')

  fastify.decorate('db', pool)

  fastify.addHook('onClose', async (instance) => {
    await instance.db.end()
  })
})
