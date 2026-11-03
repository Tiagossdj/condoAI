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
  // Fim da ocorrência e confirmação do gestor (spec 3.1); null enquanto não ocorrem
  fim: z.string().nullable(),
  resolvido_em: z.string().nullable(),
})

export const DeteccoesQuerySchema = z.object({
  limite: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.iso.datetime({ offset: true }).optional(),
  camera_id: z.string().optional(),
  classe: z.string().optional(),
  de: z.iso.datetime({ offset: true }).optional(),
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

// Fim de ocorrência em condoai/ocorrencias/fim (spec 4.4): timestamp é a
// última vez em que a classe foi vista
export const FimPayloadSchema = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  camera_id: z.string().min(1).max(50),
  classe: ClasseNomeSchema,
})

export type FimPayload = z.infer<typeof FimPayloadSchema>

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

// GET /painel (spec 7.1): agregados do dashboard analítico
export const PainelQuerySchema = z.object({
  periodo: z.enum(['24h', '7d', '30d']).default('24h'),
})

const PorClasseNumSchema = z.object({
  saco_lixo: z.number().int().min(0),
  garrafa_pet: z.number().int().min(0),
  papelao: z.number().int().min(0),
  lixo_generico: z.number().int().min(0),
})

export const PainelResponseSchema = z.object({
  periodo: z.enum(['24h', '7d', '30d']),
  de: z.string(),
  ate: z.string(),
  intervalo: z.enum(['hora', 'dia']),
  indicadores: z.object({
    total_periodo: z.number().int().min(0),
    hoje: z.number().int().min(0),
    ontem: z.number().int().min(0),
    total_geral: z.number().int().min(0),
    confianca_media: z.number().nullable(),
    latencia_ms: z
      .object({ p50: z.number(), p95: z.number(), max: z.number() })
      .nullable(),
  }),
  serie: z.array(PorClasseNumSchema.extend({ inicio: z.string() })),
  heatmap_30d: z.array(
    z.object({
      dia_semana: z.number().int().min(0).max(6),
      hora: z.number().int().min(0).max(23),
      total: z.number().int().min(1),
    }),
  ),
  por_classe: z.array(
    z.object({
      classe: ClasseNomeSchema,
      total: z.number().int().min(0),
      confianca_media: z.number().nullable(),
    }),
  ),
  por_camera: z.array(
    z.object({
      camera_id: z.string(),
      localizacao: z.string(),
      total: z.number().int().min(0),
      ultima: z.string().nullable(),
    }),
  ),
  latencia_hist: z.array(
    z.object({ de_ms: z.number().int(), ate_ms: z.number().int().nullable(), total: z.number().int().min(0) }),
  ),
  confianca_hist: z.array(PorClasseNumSchema.extend({ faixa: z.string() })),
})

export type PainelResponse = z.infer<typeof PainelResponseSchema>

// Resposta do POST /scan (spec 8.4): top-1, campos null sem detecção
export const ScanResponseSchema = z.object({
  classe: ClasseNomeSchema.nullable(),
  confianca: z.number().min(0).max(1).nullable(),
  bbox: BboxSchema.nullable(),
  latencia_ms: z.number().int().min(0),
  timestamp: z.string(),
})
