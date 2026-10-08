import type { Painel } from "@/lib/api";
import { CLASSES, CORES_CLASSE } from "@/lib/classes";
import { num, pct } from "@/lib/painel";
import { Bloco } from "./Bloco";

// Quantidade e percentual por classe no período (spec 8.2). Barras em HTML:
// cada linha leva o nome, o valor e o percentual em texto, sem depender da cor
export function PorClasse({ painel }: { painel: Painel }) {
  const total = painel.indicadores.total_periodo;
  const max = Math.max(1, ...painel.por_classe.map((c) => c.total));
  return (
    <Bloco titulo="Por classe" subtitulo="O que mais é descartado no período">
      <ul className="flex flex-col gap-4">
        {CLASSES.map(({ nome, descricao }) => {
          const valor = painel.por_classe.find((c) => c.classe === nome)?.total ?? 0;
          return (
            <li key={nome} data-classe={nome}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ background: CORES_CLASSE[nome] }}
                    aria-hidden
                  />
                  <span className="font-mono">{nome}</span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                    {descricao}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {num(valor)} <span className="text-muted-foreground">· {pct(valor, total)}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-foreground/5">
                <div
                  className="h-2 rounded-full transition-[width] duration-500"
                  style={{ width: `${(valor / max) * 100}%`, background: CORES_CLASSE[nome] }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Bloco>
  );
}
