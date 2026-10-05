'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'

// Formato do evento WebSocket emitido pelo backend (spec 7.2)
export const WsDeteccaoEventSchema = z.object({
  event: z.literal('deteccao'),
  data: z.object({
    id: z.number().int(),
    timestamp: z.string(),
    camera_id: z.string(),
    classe: z.string(),
    confianca: z.number().min(0).max(1),
    localizacao: z.string(),
    latencia_ms: z.number().int(),
  }),
})

export type WsDeteccaoEvent = z.infer<typeof WsDeteccaoEventSchema>

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws'

const RECONNECT_DELAY_MS = 3000

export function useWebSocket(url: string = WS_URL) {
  const [lastMessage, setLastMessage] = useState<WsDeteccaoEvent | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let closed = false

    function connect() {
      socket = new WebSocket(url)

      socket.onopen = () => setConnected(true)

      socket.onmessage = (event: MessageEvent) => {
        let json: unknown
        try {
          json = JSON.parse(String(event.data))
        } catch {
          console.warn('mensagem WebSocket ignorada: JSON inválido')
          return
        }

        const parsed = WsDeteccaoEventSchema.safeParse(json)
        if (!parsed.success) {
          console.warn('mensagem WebSocket ignorada: fora do schema', parsed.error.issues)
          return
        }
        setLastMessage(parsed.data)
      }

      // Reconexão automática se o backend cair (RNF08)
      socket.onclose = () => {
        setConnected(false)
        if (!closed) retry = setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }

    connect()

    return () => {
      closed = true
      clearTimeout(retry)
      socket?.close()
    }
  }, [url])

  return { lastMessage, connected }
}
