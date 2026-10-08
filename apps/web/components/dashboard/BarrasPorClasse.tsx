"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ClasseNome } from "@/lib/api";
import { CLASSES, CORES_CLASSE } from "@/lib/classes";

// Colunas empilhadas por classe, usadas pela linha do tempo e pela
// distribuição de confiança (spec 8.2). Ordem e cores fixas por classe
const CONFIG = Object.fromEntries(
  CLASSES.map(({ nome }) => [nome, { label: nome, color: CORES_CLASSE[nome] }]),
) satisfies ChartConfig;

// Legenda e tooltip na ordem fixa das classes (spec 3.2), não alfabética
const ORDEM = (dataKey: unknown) => CLASSES.findIndex((c) => c.nome === dataKey);

type Linha = Record<ClasseNome, number> & Record<string, string | number>;

type BarrasPorClasseProps = {
  dados: Linha[];
  chaveX: string;
  rotuloX: (valor: string) => string;
  rotuloTooltip?: (valor: string) => string;
  className?: string;
};

export function BarrasPorClasse({
  dados,
  chaveX,
  rotuloX,
  rotuloTooltip,
  className,
}: BarrasPorClasseProps) {
  const ultima = CLASSES.length - 1;
  return (
    <ChartContainer config={CONFIG} className={className ?? "aspect-auto h-64 w-full"}>
      <BarChart accessibilityLayer data={dados} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey={chaveX}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={12}
          tickFormatter={(v: string) => rotuloX(v)}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip
          cursor={{ fill: "var(--border)" }}
          itemSorter={(item) => ORDEM(item.dataKey)}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const v = String(payload?.[0]?.payload?.[chaveX] ?? "");
                return (rotuloTooltip ?? rotuloX)(v);
              }}
            />
          }
        />
        <ChartLegend itemSorter={null} content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
        {CLASSES.map(({ nome }, i) => (
          <Bar
            key={nome}
            dataKey={nome}
            stackId="classes"
            fill={`var(--color-${nome})`}
            // Separação de 2 px na cor da superfície entre segmentos e colunas
            stroke="var(--card)"
            strokeWidth={2}
            maxBarSize={24}
            radius={i === ultima ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
