import { z } from 'zod'

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

export const DeteccoesQuerySchema = z.object({
  limite: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.iso.datetime({ offset: true }).optional(),
  camera_id: z.string().optional(),
  classe: z.string().optional(),
})

export const DeteccoesResponseSchema = z.object({
  data: z.array(DeteccaoSchema),
  next_cursor: z.string().nullable(),
})

export const DeteccaoIdParamsSchema = z.object({
  id: z.coerce.number().int(),
})

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
})

export const ErrorResponseSchema = z.object({
  error: z.string(),
})

export const ClasseNomeSchema = z.enum(['saco_lixo', 'garrafa_pet', 'papelao', 'lixo_generico'])

export const MqttPayloadSchema = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  camera_id: z.string().min(1).max(50),
  classe: ClasseNomeSchema,
  confianca: z.number().min(0).max(1),
  localizacao: z.string(),
  latencia_ms: z.number().int().min(0),
})

export type MqttPayload = z.infer<typeof MqttPayloadSchema>

// Sinal de vida da câmera em condoai/status/<camera_id> (spec 4.7)
export const StatusPayloadSchema = z.object({
  camera_id: z.string().min(1).max(50),
  timestamp: z.iso.datetime({ offset: true }),
  estado: z.enum(['online', 'offline']),
  modelo: z.string(),
  fps: z.number().min(0).nullable(),
})

export type StatusPayload = z.infer<typeof StatusPayloadSchema>

const BboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

// Resposta do serviço de inferência (spec 4.5)
export const PredictResponseSchema = z.object({
  deteccoes: z.array(
    z.object({
      classe: ClasseNomeSchema,
      confianca: z.number().min(0).max(1),
      bbox: BboxSchema,
    }),
  ),
  inferencia_ms: z.number().int().min(0),
})

// Resposta do GET /estatisticas (spec 7.1)
export const EstatisticasResponseSchema = z.object({
  total: z.number().int().min(0),
  ultimo_id: z.number().int().nullable(),
  por_classe: z.array(
    z.object({
      classe: ClasseNomeSchema,
      total: z.number().int().min(0),
    }),
  ),
})

// Resposta do POST /scan (spec 8.4): top-1, campos null sem detecção
export const ScanResponseSchema = z.object({
  classe: ClasseNomeSchema.nullable(),
  confianca: z.number().min(0).max(1).nullable(),
  bbox: BboxSchema.nullable(),
  latencia_ms: z.number().int().min(0),
  timestamp: z.string(),
})
