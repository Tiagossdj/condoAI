import type { Periodo } from './api'

// O backend agrupa no fuso do condomínio (spec 7.1); os rótulos usam o mesmo
// fuso, para não depender do fuso do aparelho de quem vê o painel
export const TZ = 'America/Sao_Paulo'

export const ROTULO_PERIODO: Record<Periodo, string> = {
  '24h': 'Últimas 24 h',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
}

// Rótulo dos botões do seletor (cabe numa linha no celular)
export const ROTULO_PERIODO_CURTO: Record<Periodo, string> = {
  '24h': '24 h',
  '7d': '7 dias',
  '30d': '30 dias',
}

export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' })
const fmtDia = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' })
const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
})
const fmtCompleto = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ,
  dateStyle: 'short',
  timeStyle: 'short',
})

// Rótulo curto do eixo: "14h" (por hora) ou "08/10" (por dia)
export function rotuloIntervalo(iso: string, intervalo: 'hora' | 'dia'): string {
  const d = new Date(iso)
  return intervalo === 'hora' ? `${fmtHora.format(d)}h` : fmtDia.format(d)
}

// Rótulo do tooltip: "08/10, 14h–15h" ou "qua., 08/10"
export function rotuloIntervaloLongo(iso: string, intervalo: 'hora' | 'dia'): string {
  const d = new Date(iso)
  if (intervalo === 'dia') return fmtDiaSemana.format(d)
  const h = Number(fmtHora.format(d))
  return `${fmtDia.format(d)}, ${h}h–${(h + 1) % 24}h`
}

export function dataHora(iso: string): string {
  return fmtCompleto.format(new Date(iso))
}

export function pct(v: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((v / total) * 100)}%`
}

export function ms(v: number): string {
  return v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : `${v} ms`
}

const fmtNum = new Intl.NumberFormat('pt-BR')
export const num = (v: number) => fmtNum.format(v)
