"use client";

import type { Painel } from "@/lib/api";
import { CLASSES } from "@/lib/classes";
import { BarrasPorClasse } from "./BarrasPorClasse";
import { Bloco, Vazio } from "./Bloco";

const faixa = (v: string) => v.replace("-", "–").replaceAll(".", ",");

// Distribuição da confiança por classe, de 0,4 (threshold, spec 4.3) a 1,0
export function Confianca({ painel }: { painel: Painel }) {
  const { confianca_hist, por_classe, indicadores } = painel;
  return (
    <Bloco
      titulo="Confiança do modelo"
      subtitulo="Ocorrências por faixa de confiança (threshold 0,4)"
    >
      {indicadores.total_periodo === 0 ? (
        <Vazio>Nenhuma ocorrência no período.</Vazio>
      ) : (
        <>
          <BarrasPorClasse
            dados={confianca_hist}
            chaveX="faixa"
            rotuloX={faixa}
            rotuloTooltip={(v) => `Confiança ${faixa(v)}`}
            className="aspect-auto h-56 w-full"
          />
          <dl className="flex flex-col gap-1 text-xs">
            {CLASSES.map(({ nome }) => {
              const c = por_classe.find((p) => p.classe === nome);
              return (
                <div key={nome} className="flex justify-between gap-2">
                  <dt className="font-mono text-muted-foreground">{nome}</dt>
                  <dd className="tabular-nums">
                    {c?.confianca_media != null ? `média ${Math.round(c.confianca_media * 100)}%` : "—"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
    </Bloco>
  );
}
