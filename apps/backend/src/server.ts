import Fastify from 'fastify'
import dbPlugin from './plugins/db.js'

export function buildServer() {
  const app = Fastify({ logger: true })
  app.register(dbPlugin)
  return app
}

const app = buildServer()
const port = Number(process.env.PORT) || 3001

await app.listen({ port, host: '0.0.0.0' })
