import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { Painel, Periodo } from "@/lib/api";
import { ms, num, ROTULO_PERIODO } from "@/lib/painel";

type IndicadoresProps = {
  painel: Painel;
  periodo: Periodo;
  cameras: { online: number; total: number };
};

function Tile({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: React.ReactNode }) {
  return (
    <Card className="gap-0 p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-2 text-2xl font-medium sm:text-3xl">{valor}</p>
      {detalhe && <div className="mt-1 text-xs text-muted-foreground">{detalhe}</div>}
    </Card>
  );
}

// Hoje vs. ontem. Mais ocorrências é pior, mas a variação vem em texto neutro
// com seta: cor de status fica reservada a estados (online/offline)
function Variacao({ hoje, ontem }: { hoje: number; ontem: number }) {
  const d = hoje - ontem;
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;
  return (
    <span className="flex items-center gap-1">
      <Icon className="size-3.5" aria-hidden />
      {d === 0 ? "igual a ontem" : `${d > 0 ? "+" : ""}${num(d)} vs. ontem (${num(ontem)})`}
    </span>
  );
}

// KPIs do período (spec 8.2)
export function Indicadores({ painel, periodo, cameras }: IndicadoresProps) {
  const i = painel.indicadores;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
      {/* Número principal do painel: ocorrências de hoje */}
      <Card className="col-span-2 gap-0 bg-brand/40 p-5">
        <p className="text-xs text-muted-foreground">Ocorrências hoje</p>
        <p className="mt-2 text-6xl font-medium text-accent-warm">{num(i.hoje)}</p>
        <div className="mt-1 text-xs text-muted-foreground">
          <Variacao hoje={i.hoje} ontem={i.ontem} />
        </div>
      </Card>
      <Tile
        rotulo={ROTULO_PERIODO[periodo]}
        valor={num(i.total_periodo)}
        detalhe={`${num(i.total_geral)} no total`}
      />
      <Tile
        rotulo="Câmeras monitorando"
        valor={`${cameras.online} de ${cameras.total}`}
        detalhe={cameras.online === cameras.total && cameras.total > 0 ? "todas online" : "ver tabela por câmera"}
      />
      <Tile
        rotulo="Latência (mediana)"
        valor={i.latencia_ms ? ms(i.latencia_ms.p50) : "—"}
        detalhe={i.latencia_ms ? `p95 ${ms(i.latencia_ms.p95)} · captura → MQTT` : "sem dados no período"}
      />
      <Tile
        rotulo="Confiança média"
        valor={i.confianca_media != null ? `${Math.round(i.confianca_media * 100)}%` : "—"}
        detalhe="threshold 40%"
      />
    </div>
  );
}
