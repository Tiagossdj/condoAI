import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

// Agendador do alerta escalonado ao gestor (spec 7.3): avisa pelo ntfy quando
// um resíduo permanece em zona proibida além de cada limite de tempo.

// A ocorrência mais recente de cada par (câmera, classe), contando as já
// encerradas; só depois filtra as abertas. Assim uma ocorrência que ficou
// aberta porque o main.py caiu não volta a alertar depois que a seguinte termina
const SELECT_CANDIDATAS = `
  SELECT id, timestamp, alertas_enviados, camera_id, localizacao, classe
  FROM (
    SELECT DISTINCT ON (d.camera_id, d.classe_id)
           d.id, d.timestamp, d.fim, d.resolvido_em, d.alertas_enviados,
           c.camera_id, c.localizacao, cl.nome AS classe
    FROM deteccoes d
    JOIN cameras c ON c.id = d.camera_id
    JOIN classes cl ON cl.id = d.classe_id
    WHERE c.tipo_area = 'zona_proibida' AND c.ativo
    ORDER BY d.camera_id, d.classe_id, d.timestamp DESC
  ) ultima
  WHERE fim IS NULL AND resolvido_em IS NULL
`

// Guarda contra dois ciclos gravando o mesmo limite
const UPDATE_ALERTAS = `
  UPDATE deteccoes SET alertas_enviados = $2
  WHERE id = $1 AND alertas_enviados < $2
`

type Candidata = {
  id: number
  timestamp: Date
  alertas_enviados: number
  camera_id: string
  localizacao: string
  classe: string
}

const ENVIO_TIMEOUT_MS = 5_000

export function lerLimites(valor: string | undefined): number[] | null {
  const limites = (valor ?? '600,2400,7200').split(',').map((x) => Number(x.trim()))
  const validos =
    limites.length > 0 &&
    limites.every((x) => Number.isInteger(x) && x > 0) &&
    limites.every((x, i) => i === 0 || x > limites[i - 1]!)
  return validos ? limites : null
}

export function formatarPermanencia(segundos: number): string {
  if (segundos < 60) return `${Math.floor(segundos)} s`
  const min = Math.floor(segundos / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto ? `${h} h ${String(resto).padStart(2, '0')} min` : `${h} h`
}

// Prioridade do ntfy (1–5) sobe a cada limite: padrão → alta → urgente
function prioridade(limite: number): number {
  return Math.min(3 + limite, 5)
}

// Uma notificação por ocorrência: cada alerta e a confirmação substituem a
// anterior no celular, em vez de se acumularem (spec 7.3)
function sequencia(id: number): string {
  return `ocorrencia-${id}`
}

const horaLocal = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
})

export type Resolucao = {
  id: number
  classe: string
  localizacao: string
  timestamp: Date
  resolvidoEm: Date
}

declare module 'fastify' {
  interface FastifyInstance {
    // Confirma ao gestor, no celular, a primeira resolução de uma ocorrência;
    // sem efeito com os alertas desativados
    confirmarResolucao: (r: Resolucao) => Promise<void>
  }
}

export default fp(
  async function alertasPlugin(fastify: FastifyInstance) {
    const ntfyUrl = process.env.NTFY_URL
    const topico = process.env.NTFY_TOPICO ?? 'condoai-alertas'
    const backendLan = process.env.BACKEND_URL_LAN
    const limites = lerLimites(process.env.ALERTA_LIMITES_S)
    const intervaloS = Number(process.env.ALERTA_VERIFICACAO_S ?? 60)

    let ativo = false
    fastify.decorate('confirmarResolucao', async (r: Resolucao) => {
      if (!ativo) return
      const apos = formatarPermanencia((r.resolvidoEm.getTime() - r.timestamp.getTime()) / 1000)
      await publicar(
        {
          topic: topico,
          sequence_id: sequencia(r.id),
          title: 'condoAI · resolvido',
          message: `✔ ${r.classe} em ${r.localizacao} resolvida às ${horaLocal.format(r.resolvidoEm)} (${apos} após a detecção)`,
          priority: 2,
          tags: ['white_check_mark'],
        },
        r.id,
      )
    })

    // Sem ntfy configurado o backend sobe normalmente, só sem alertas (RNF08)
    if (!ntfyUrl || !backendLan) {
      fastify.log.warn('alertas ao gestor desativados: defina NTFY_URL e BACKEND_URL_LAN')
      return
    }
    if (!limites) {
      fastify.log.error({ ALERTA_LIMITES_S: process.env.ALERTA_LIMITES_S }, 'alertas desativados: limites inválidos')
      return
    }
    if (!(intervaloS > 0)) {
      fastify.log.error({ ALERTA_VERIFICACAO_S: process.env.ALERTA_VERIFICACAO_S }, 'alertas desativados: intervalo inválido')
      return
    }

    async function publicar(corpo: object, id: number): Promise<boolean> {
      try {
        const res = await fetch(ntfyUrl!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
          signal: AbortSignal.timeout(ENVIO_TIMEOUT_MS),
        })
        if (!res.ok) {
          fastify.log.error({ status: res.status, id }, 'ntfy recusou a notificação')
          return false
        }
        return true
      } catch (err) {
        fastify.log.error({ err, id }, 'falha ao enviar notificação ao ntfy')
        return false
      }
    }

    function enviar(c: Candidata, limite: number, permanenciaS: number): Promise<boolean> {
      return publicar(
        {
          topic: topico,
          sequence_id: sequencia(c.id),
          title: 'condoAI · resíduo em zona proibida',
          // Sem imagem (spec 5): só classe, local e tempo de permanência
          message: `${c.classe} em ${c.localizacao} há ${formatarPermanencia(permanenciaS)}`,
          priority: prioridade(limite),
          tags: ['wastebasket'],
          actions: [
            {
              action: 'http',
              label: 'Resolvido',
              url: `${backendLan}/deteccoes/${c.id}/resolver`,
              method: 'POST',
              // JSON explícito: o Fastify recusa Content-Type JSON com corpo vazio
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
              clear: true,
            },
          ],
        },
        c.id,
      )
    }

    async function verificar() {
      const { rows } = await fastify.db.query<Candidata>(SELECT_CANDIDATAS)
      const agora = Date.now()
      for (const c of rows) {
        // Com a câmera offline não se sabe se o resíduo continua no local; e uma
        // ocorrência de antes da sessão atual (main.py reiniciado, ou registrada
        // antes do fim de ocorrência existir) não é acompanhada pelo main.py
        const onlineDesde = fastify.cameraOnlineDesde(c.camera_id)
        if (!onlineDesde || c.timestamp < onlineDesde) continue

        const permanenciaS = (agora - c.timestamp.getTime()) / 1000
        const ultrapassados = limites!.filter((l) => permanenciaS >= l).length
        if (ultrapassados <= c.alertas_enviados) continue

        // Vários limites de uma vez (ex.: backend fora do ar): um alerta só
        if (!(await enviar(c, ultrapassados - 1, permanenciaS))) continue
        await fastify.db.query(UPDATE_ALERTAS, [c.id, ultrapassados])
        fastify.log.info(
          { id: c.id, camera_id: c.camera_id, classe: c.classe, limite: ultrapassados, de: limites!.length },
          'alerta enviado ao gestor',
        )
      }
    }

    let rodando = false
    const timer = setInterval(() => {
      if (rodando) return
      rodando = true
      verificar()
        .catch((err) => fastify.log.error({ err }, 'falha no agendador de alertas'))
        .finally(() => {
          rodando = false
        })
    }, intervaloS * 1000)

    fastify.addHook('onClose', async () => {
      clearInterval(timer)
    })

    ativo = true
    fastify.log.info({ topico, limites, intervalo_s: intervaloS }, 'alertas ao gestor ativados')
  },
  { decorators: { fastify: ['db', 'cameraOnlineDesde'] } },
)
