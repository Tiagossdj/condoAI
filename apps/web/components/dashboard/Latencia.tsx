"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Painel } from "@/lib/api";
import { ms, num, pct } from "@/lib/painel";
import { Bloco, Vazio } from "./Bloco";

// Série única: um tom só, sem legenda (o título diz o que é)
const CONFIG = { total: { label: "Ocorrências", color: "#3987e5" } } satisfies ChartConfig;

const META_MS = 3000; // H2: pipeline completo < 3 s (spec 1.4)

// "10–20 ms", "1–2 s", "≥ 3 s"
const rotulo = (de: number, ate: number | null) => {
  if (ate === null) return `≥ ${ms(de)}`;
  return ate <= 1000 ? `${de}–${ate} ms` : `${de / 1000}–${ate / 1000} s`;
};

// Distribuição de latencia_ms: captura do frame → publicação MQTT (spec 4.2).
// Não é a latência total da H2, que inclui backend e dashboard (spec 1.5)
export function Latencia({ painel, className }: { painel: Painel; className?: string }) {
  const { latencia_hist, indicadores } = painel;
  const total = latencia_hist.reduce((s, f) => s + f.total, 0);
  const abaixo = latencia_hist.filter((f) => f.ate_ms !== null && f.ate_ms <= META_MS).reduce((s, f) => s + f.total, 0);
  const dados = latencia_hist.map((f) => ({ faixa: rotulo(f.de_ms, f.ate_ms), total: f.total }));
  const l = indicadores.latencia_ms;

  return (
    <Bloco
      titulo="Latência captura → publicação"
      className={className}
      subtitulo="Do frame capturado até a publicação no MQTT; meta da H2: pipeline completo abaixo de 3 s"
    >
      {total === 0 || !l ? (
        <Vazio>Nenhuma ocorrência com latência registrada no período.</Vazio>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Mediana</dt>
              <dd className="text-xl">{ms(l.p50)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">p95</dt>
              <dd className="text-xl">{ms(l.p95)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Abaixo de 3 s</dt>
              <dd className="text-xl">{pct(abaixo, total)}</dd>
            </div>
          </dl>
          <ChartContainer config={CONFIG} className="aspect-auto h-48 w-full">
            <BarChart accessibilityLayer data={dados} margin={{ top: 4, right: 4, left: 12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="faixa"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={48}
                fontSize={10}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
              <ChartTooltip
                cursor={{ fill: "var(--border)" }}
                content={<ChartTooltipContent labelFormatter={(v) => `Latência ${v}`} />}
              />
              <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">
            {num(total)} ocorrências no período; máximo de {ms(l.max)}. Detecções do loop contínuo
            ficam em dezenas de ms; as do /scan incluem HTTP e inferência sob demanda.
          </p>
        </>
      )}
    </Bloco>
  );
}
