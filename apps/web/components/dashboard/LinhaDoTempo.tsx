"use client";

import type { Painel } from "@/lib/api";
import { rotuloIntervalo, rotuloIntervaloLongo } from "@/lib/painel";
import { BarrasPorClasse } from "./BarrasPorClasse";
import { Bloco, Vazio } from "./Bloco";

// Ocorrências por hora (24 h) ou por dia (7/30 dias), empilhadas por classe (spec 8.2)
export function LinhaDoTempo({ painel, className }: { painel: Painel; className?: string }) {
  const { serie, intervalo, indicadores } = painel;
  return (
    <Bloco
      titulo="Linha do tempo"
      className={className}
      subtitulo={`Ocorrências por ${intervalo}, por classe`}
    >
      {indicadores.total_periodo === 0 ? (
        <Vazio>Nenhuma ocorrência no período.</Vazio>
      ) : (
        <BarrasPorClasse
          dados={serie}
          chaveX="inicio"
          rotuloX={(v) => rotuloIntervalo(v, intervalo)}
          rotuloTooltip={(v) => rotuloIntervaloLongo(v, intervalo)}
        />
      )}
    </Bloco>
  );
}
