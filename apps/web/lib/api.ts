import { z } from 'zod'

// Schemas espelham apps/backend/src/schemas/index.ts (spec 2.5 e 7.1)

export const CameraSchema = z.object({
  id: z.number().int(),
  camera_id: z.string(),
  localizacao: z.string(),
})

export const ClasseSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
})

export const DeteccaoSchema = z.object({
  id: z.number().int(),
  timestamp: z.string(),
  camera: CameraSchema,
  classe: ClasseSchema,
  confianca: z.number().min(0).max(1),
  latencia_ms: z.number().int().nullable(),
})

export const DeteccoesResponseSchema = z.object({
  data: z.array(DeteccaoSchema),
  next_cursor: z.string().nullable(),
})

export type Camera = z.infer<typeof CameraSchema>
export type Classe = z.infer<typeof ClasseSchema>
export type Deteccao = z.infer<typeof DeteccaoSchema>
export type DeteccoesResponse = z.infer<typeof DeteccoesResponseSchema>

export type DeteccoesParams = {
  limite?: number
  cursor?: string
  camera_id?: string
  classe?: string
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) {
    throw new Error(`GET ${path} falhou: HTTP ${res.status}`)
  }

  const parsed = schema.safeParse(await res.json())
  if (!parsed.success) {
    throw new Error(`GET ${path} retornou resposta fora do schema: ${parsed.error.message}`)
  }
  return parsed.data
}

export function getDeteccoes(params: DeteccoesParams = {}): Promise<DeteccoesResponse> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value))
  }
  const qs = query.size ? `?${query}` : ''
  return request(`/deteccoes${qs}`, DeteccoesResponseSchema)
}

export function getCameras(): Promise<Camera[]> {
  return request('/cameras', z.array(CameraSchema))
}

export function getClasses(): Promise<Classe[]> {
  return request('/classes', z.array(ClasseSchema))
}
