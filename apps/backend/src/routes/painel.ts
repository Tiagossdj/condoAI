import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import {
  PainelQuerySchema,
  PainelResponseSchema,
  type PainelResponse,
} from '../schemas/index.js'

// Agregados do dashboard analítico (spec 7.1). Horas e dias são contados no
// fuso local, para "hoje" e o eixo do gráfico baterem com o relógio do condomínio
const TZ = 'America/Sao_Paulo'

const CLASSES = ['saco_lixo', 'garrafa_pet', 'papelao', 'lixo_generico'] as const
type Classe = (typeof CLASSES)[number]

const PERIODOS = {
  '24h': { unidade: 'hour', passos: 24, intervalo: 'hora' },
  '7d': { unidade: 'day', passos: 7, intervalo: 'dia' },
  '30d': { unidade: 'day', passos: 30, intervalo: 'dia' },
} as const

// Faixas de latência de largura crescente: o main.py fica em dezenas de ms e
// o /scan (HTTP + inferência) em centenas; a última faixa é "acima da meta"
// de 3 s (H2, spec 1.5)
const LATENCIA_LIMITES_MS = [0, 10, 20, 50, 100, 200, 500, 1000, 2000, 3000]
// Faixas de confiança: do threshold (spec 4.3) até 1,0, de 0,1 em 0,1
const CONFIANCA_FAIXAS = [4, 5, 6, 7, 8, 9]

const zeros = (): Record<Classe, number> => ({
  saco_lixo: 0,
  garrafa_pet: 0,
  papelao: 0,
  lixo_generico: 0,
})

// Limites do período alinhados aos intervalos do gráfico: o 1º intervalo
// começa no início da hora (ou do dia) local, N-1 passos antes do atual
const SQL_LIMITES = `
  SELECT (inicio_local AT TIME ZONE $1) AS de, now() AS ate
  FROM (
    SELECT date_trunc($2, now() AT TIME ZONE $1) - ($3::int - 1) * ('1 ' || $2)::interval AS inicio_local
  ) l
`

const SQL_INDICADORES = `
  SELECT
    count(*) FILTER (WHERE d.timestamp >= $2)::int AS total_periodo,
    count(*) FILTER (WHERE (d.timestamp AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date)::int AS hoje,
    count(*) FILTER (WHERE (d.timestamp AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date - 1)::int AS ontem,
    count(*)::int AS total_geral,
    avg(d.confianca) FILTER (WHERE d.timestamp >= $2)::float8 AS confianca_media,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY d.latencia_ms) FILTER (WHERE d.timestamp >= $2) AS p50,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY d.latencia_ms) FILTER (WHERE d.timestamp >= $2) AS p95,
    max(d.latencia_ms) FILTER (WHERE d.timestamp >= $2) AS max
  FROM deteccoes d
`

// Todos os intervalos do período (inclusive vazios) × as 4 classes
const SQL_SERIE = `
  WITH intervalos AS (
    SELECT generate_series(
      date_trunc($2, $3::timestamptz AT TIME ZONE $1),
      date_trunc($2, now() AT TIME ZONE $1),
      ('1 ' || $2)::interval
    ) AS inicio_local
  )
  SELECT (i.inicio_local AT TIME ZONE $1) AS inicio, cl.nome AS classe, count(d.id)::int AS total
  FROM intervalos i
  CROSS JOIN classes cl
  LEFT JOIN deteccoes d
    ON d.classe_id = cl.id
   AND d.timestamp >= $3
   AND date_trunc($2, d.timestamp AT TIME ZONE $1) = i.inicio_local
  GROUP BY i.inicio_local, cl.id, cl.nome
  ORDER BY i.inicio_local, cl.id
`

const SQL_HEATMAP = `
  SELECT
    extract(dow FROM d.timestamp AT TIME ZONE $1)::int AS dia_semana,
    extract(hour FROM d.timestamp AT TIME ZONE $1)::int AS hora,
    count(*)::int AS total
  FROM deteccoes d
  WHERE d.timestamp >= now() - interval '30 days'
  GROUP BY 1, 2
  ORDER BY 1, 2
`

const SQL_POR_CLASSE = `
  SELECT cl.nome AS classe, count(d.id)::int AS total, avg(d.confianca)::float8 AS confianca_media
  FROM classes cl
  LEFT JOIN deteccoes d ON d.classe_id = cl.id AND d.timestamp >= $1
  GROUP BY cl.id, cl.nome
  ORDER BY cl.id
`

// total no período; "ultima" considera todo o histórico da câmera
const SQL_POR_CAMERA = `
  SELECT
    c.camera_id,
    c.localizacao,
    count(d.id) FILTER (WHERE d.timestamp >= $1)::int AS total,
    max(d.timestamp) AS ultima
  FROM cameras c
  LEFT JOIN deteccoes d ON d.camera_id = c.id
  WHERE c.ativo
  GROUP BY c.id, c.camera_id, c.localizacao
  ORDER BY c.camera_id
`

// width_bucket devolve 1..N para cada faixa [limite_i, limite_i+1) e N para >= 3000
const SQL_LATENCIA_HIST = `
  SELECT width_bucket(d.latencia_ms, $2::int[]) AS faixa, count(*)::int AS total
  FROM deteccoes d
  WHERE d.timestamp >= $1 AND d.latencia_ms IS NOT NULL
  GROUP BY 1
`

const SQL_CONFIANCA_HIST = `
  SELECT least(floor(d.confianca * 10), 9)::int AS faixa, cl.nome AS classe, count(*)::int AS total
  FROM deteccoes d
  JOIN classes cl ON cl.id = d.classe_id
  WHERE d.timestamp >= $1
  GROUP BY 1, 2
`

const iso = (d: Date) => d.toISOString()

export default async function painelRoutes(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/painel',
    {
      schema: {
        querystring: PainelQuerySchema,
        response: { 200: PainelResponseSchema },
      },
    },
    async (request): Promise<PainelResponse> => {
      const { periodo } = request.query
      const { unidade, passos, intervalo } = PERIODOS[periodo]
      const db = fastify.db

      const limites = await db.query<{ de: Date; ate: Date }>(SQL_LIMITES, [TZ, unidade, passos])
      const { de, ate } = limites.rows[0]!

      const [ind, serie, heat, porClasse, porCamera, lat, conf] = await Promise.all([
        db.query<{
          total_periodo: number
          hoje: number
          ontem: number
          total_geral: number
          confianca_media: number | null
          p50: number | null
          p95: number | null
          max: number | null
        }>(SQL_INDICADORES, [TZ, de]),
        db.query<{ inicio: Date; classe: Classe; total: number }>(SQL_SERIE, [TZ, unidade, de]),
        db.query<{ dia_semana: number; hora: number; total: number }>(SQL_HEATMAP, [TZ]),
        db.query<{ classe: Classe; total: number; confianca_media: number | null }>(SQL_POR_CLASSE, [de]),
        db.query<{ camera_id: string; localizacao: string; total: number; ultima: Date | null }>(
          SQL_POR_CAMERA,
          [de],
        ),
        db.query<{ faixa: number; total: number }>(SQL_LATENCIA_HIST, [de, LATENCIA_LIMITES_MS]),
        db.query<{ faixa: number; classe: Classe; total: number }>(SQL_CONFIANCA_HIST, [de]),
      ])

      const i = ind.rows[0]!

      // Pivota a série: uma linha por intervalo, uma coluna por classe
      const porInicio = new Map<string, Record<Classe, number> & { inicio: string }>()
      for (const r of serie.rows) {
        const chave = iso(r.inicio)
        const linha = porInicio.get(chave) ?? { inicio: chave, ...zeros() }
        linha[r.classe] = r.total
        porInicio.set(chave, linha)
      }

      // Todas as faixas, inclusive vazias; ate_ms null na última (>= 3 s)
      const latPorFaixa = new Map(lat.rows.map((r) => [r.faixa, r.total]))
      const latencia_hist = LATENCIA_LIMITES_MS.map((de_ms, idx) => ({
        de_ms,
        ate_ms: LATENCIA_LIMITES_MS[idx + 1] ?? null,
        total: latPorFaixa.get(idx + 1) ?? 0,
      }))

      const confianca_hist = CONFIANCA_FAIXAS.map((f) => {
        const linha = { faixa: `0.${f}-${f === 9 ? '1.0' : `0.${f + 1}`}`, ...zeros() }
        for (const r of conf.rows) if (r.faixa === f) linha[r.classe] = r.total
        return linha
      })

      return {
        periodo,
        de: iso(de),
        ate: iso(ate),
        intervalo,
        indicadores: {
          total_periodo: i.total_periodo,
          hoje: i.hoje,
          ontem: i.ontem,
          total_geral: i.total_geral,
          confianca_media: i.confianca_media,
          latencia_ms:
            i.p50 === null || i.p95 === null || i.max === null
              ? null
              : { p50: Math.round(i.p50), p95: Math.round(i.p95), max: i.max },
        },
        serie: [...porInicio.values()],
        heatmap_30d: heat.rows,
        por_classe: porClasse.rows,
        por_camera: porCamera.rows.map((r) => ({ ...r, ultima: r.ultima ? iso(r.ultima) : null })),
        latencia_hist,
        confianca_hist,
      }
    },
  )
}
