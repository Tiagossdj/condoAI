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
