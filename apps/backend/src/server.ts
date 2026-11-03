import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod'
import dbPlugin from './plugins/db.js'
import websocketPlugin from './plugins/websocket.js'
import mqttPlugin from './plugins/mqtt.js'
import alertasPlugin from './plugins/alertas.js'
import healthRoutes from './routes/health.js'
import camerasRoutes from './routes/cameras.js'
import classesRoutes from './routes/classes.js'
import deteccoesRoutes from './routes/deteccoes.js'
import scanRoutes from './routes/scan.js'
import estatisticasRoutes from './routes/estatisticas.js'
import painelRoutes from './routes/painel.js'

export function buildServer() {
  const app = Fastify({ logger: true })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Qualquer origem: sistema local/LAN, aberto ao público, sem cookies nem
  // autenticação — a origem muda quando o celular acessa pelo IP da LAN
  app.register(cors, { origin: true })
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } })
  app.register(dbPlugin)
  app.register(websocketPlugin)
  app.register(mqttPlugin)
  app.register(alertasPlugin)
  app.register(healthRoutes)
  app.register(camerasRoutes)
  app.register(classesRoutes)
  app.register(deteccoesRoutes)
  app.register(scanRoutes)
  app.register(estatisticasRoutes)
  app.register(painelRoutes)

  return app
}

const app = buildServer()
const port = Number(process.env.PORT) || 3001

await app.listen({ port, host: '0.0.0.0' })
