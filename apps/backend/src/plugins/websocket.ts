import fp from 'fastify-plugin'
import websocket from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    broadcast: (event: string, data: unknown) => void
  }
}

export default fp(async function websocketPlugin(fastify: FastifyInstance) {
  await fastify.register(websocket)

  fastify.decorate('broadcast', (event: string, data: unknown) => {
    const message = JSON.stringify({ event, data })
    for (const client of fastify.websocketServer.clients) {
      if (client.readyState === client.OPEN) {
        client.send(message)
      }
    }
  })

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    request.log.info({ clientes: fastify.websocketServer.clients.size }, 'cliente WebSocket conectado')
    socket.on('close', () => {
      request.log.info('cliente WebSocket desconectado')
    })
  })
})
