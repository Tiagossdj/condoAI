import Fastify from 'fastify'

export function buildServer() {
  const app = Fastify({ logger: true })
  return app
}

const app = buildServer()
const port = Number(process.env.PORT) || 3001

await app.listen({ port, host: '0.0.0.0' })
