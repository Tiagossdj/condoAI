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

export const ClasseNomeSchema = z.enum(['saco_lixo', 'garrafa_pet', 'papelao', 'lixo_generico'])

// Resposta do POST /scan (spec 8.4): top-1, campos null sem detecção
export const ScanResponseSchema = z.object({
  classe: ClasseNomeSchema.nullable(),
  confianca: z.number().min(0).max(1).nullable(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  latencia_ms: z.number().int().min(0),
  timestamp: z.string(),
})

// Resposta do GET /estatisticas (spec 7.1)
export const EstatisticasSchema = z.object({
  total: z.number().int().min(0),
  ultimo_id: z.number().int().nullable(),
  por_classe: z.array(z.object({ classe: ClasseNomeSchema, total: z.number().int().min(0) })),
})

export type Estatisticas = z.infer<typeof EstatisticasSchema>
export type ClasseNome = z.infer<typeof ClasseNomeSchema>
export type ScanResponse = z.infer<typeof ScanResponseSchema>
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

// Sem NEXT_PUBLIC_API_URL, usa o mesmo host da página na porta 3001: no celular
// acessando pelo IP da LAN, "localhost" seria o próprio celular (RF07)
export function apiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:3001`
  return 'http://localhost:3001'
}

async function request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`)
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

export function getEstatisticas(): Promise<Estatisticas> {
  return request('/estatisticas', EstatisticasSchema)
}

const ErrorBodySchema = z.object({ error: z.string() })

export async function scanFrame(frame: Blob, cameraId: string): Promise<ScanResponse> {
  const body = new FormData()
  body.append('frame', frame, 'frame.jpg')
  body.append('camera_id', cameraId)

  const res = await fetch(`${apiUrl()}/scan`, { method: 'POST', body })
  const json: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const error = ErrorBodySchema.safeParse(json)
    throw new Error(error.success ? error.data.error : `POST /scan falhou: HTTP ${res.status}`)
  }

  const parsed = ScanResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(`POST /scan retornou resposta fora do schema: ${parsed.error.message}`)
  }
  return parsed.data
}
