import fp from 'fastify-plugin'
import websocket from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'

// Gera os eventos enviados a cada cliente assim que ele conecta (ex.: estado
// atual das câmeras, spec 7.2); calculado na hora do envio
type SnapshotProvider = () => unknown[]

declare module 'fastify' {
  interface FastifyInstance {
    broadcast: (event: string, data: unknown) => void
    addSnapshot: (event: string, provider: SnapshotProvider) => void
  }
}

export default fp(async function websocketPlugin(fastify: FastifyInstance) {
  await fastify.register(websocket)

  const snapshots: { event: string; provider: SnapshotProvider }[] = []

  fastify.decorate('broadcast', (event: string, data: unknown) => {
    const message = JSON.stringify({ event, data })
    for (const client of fastify.websocketServer.clients) {
      if (client.readyState === client.OPEN) {
        client.send(message)
      }
    }
  })

  fastify.decorate('addSnapshot', (event: string, provider: SnapshotProvider) => {
    snapshots.push({ event, provider })
  })

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    request.log.info({ clientes: fastify.websocketServer.clients.size }, 'cliente WebSocket conectado')
    for (const { event, provider } of snapshots) {
      for (const data of provider()) {
        socket.send(JSON.stringify({ event, data }))
      }
    }
    socket.on('close', () => {
      request.log.info('cliente WebSocket desconectado')
    })
  })
})
