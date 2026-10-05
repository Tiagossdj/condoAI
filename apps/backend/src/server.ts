import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod'
import dbPlugin from './plugins/db.js'
import healthRoutes from './routes/health.js'
import camerasRoutes from './routes/cameras.js'
import classesRoutes from './routes/classes.js'
import deteccoesRoutes from './routes/deteccoes.js'

export function buildServer() {
  const app = Fastify({ logger: true })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(dbPlugin)
  app.register(healthRoutes)
  app.register(camerasRoutes)
  app.register(classesRoutes)
  app.register(deteccoesRoutes)

  return app
}

const app = buildServer()
const port = Number(process.env.PORT) || 3001

await app.listen({ port, host: '0.0.0.0' })
