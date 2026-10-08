"use client";

import { useState } from "react";

import type { Painel } from "@/lib/api";
import { DIAS_SEMANA, num } from "@/lib/painel";
import { Bloco, Vazio } from "./Bloco";

// Escala sequencial de um só tom (azul), do valor baixo ao alto. Na
// superfície escura, mais ocorrências = mais claro (mais contraste)
const RAMPA = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];
const HORAS = Array.from({ length: 24 }, (_, h) => h);

function corDa(total: number, max: number): string | undefined {
  if (total === 0) return undefined;
  const i = Math.min(RAMPA.length - 1, Math.floor(((total - 1) / Math.max(max, 1)) * RAMPA.length));
  return RAMPA[i];
}

// Dia da semana × hora nos últimos 30 dias: horários críticos de descarte (spec 8.2)
export function MapaDeCalor({ painel, className }: { painel: Painel; className?: string }) {
  const [foco, setFoco] = useState<{ dia: number; hora: number; total: number } | null>(null);
  const celulas = new Map(painel.heatmap_30d.map((c) => [`${c.dia_semana}-${c.hora}`, c.total]));
  const max = Math.max(0, ...painel.heatmap_30d.map((c) => c.total));
  const pico = painel.heatmap_30d.reduce<(typeof painel.heatmap_30d)[number] | null>(
    (a, c) => (!a || c.total > a.total ? c : a),
    null,
  );

  return (
    <Bloco
      titulo="Mapa de calor"
      className={className}
      subtitulo={
        pico
          ? `Últimos 30 dias · pico: ${DIAS_SEMANA[pico.dia_semana]} às ${pico.hora}h (${num(pico.total)})`
          : "Últimos 30 dias"
      }
    >
      {max === 0 ? (
        <Vazio>Nenhuma ocorrência nos últimos 30 dias.</Vazio>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] table-fixed border-separate border-spacing-0.5 text-xs">
              <caption className="sr-only">
                Ocorrências por dia da semana e hora nos últimos 30 dias
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-9" />
                  {HORAS.map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="font-mono font-normal text-muted-foreground"
                    >
                      {h % 3 === 0 ? h : ""}
                      <span className="sr-only">{h % 3 === 0 ? "h" : `${h}h`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIAS_SEMANA.map((dia, d) => (
                  <tr key={dia}>
                    <th scope="row" className="pr-1 text-left font-mono font-normal text-muted-foreground">
                      {dia}
                    </th>
                    {HORAS.map((h) => {
                      const total = celulas.get(`${d}-${h}`) ?? 0;
                      const cor = corDa(total, max);
                      return (
                        <td
                          key={h}
                          tabIndex={total > 0 ? 0 : -1}
                          aria-label={`${dia}, ${h}h: ${total} ocorrência${total === 1 ? "" : "s"}`}
                          onPointerEnter={() => setFoco({ dia: d, hora: h, total })}
                          onPointerLeave={() => setFoco(null)}
                          onFocus={() => setFoco({ dia: d, hora: h, total })}
                          onBlur={() => setFoco(null)}
                          className="h-5 rounded-[3px] outline-offset-1 hover:outline hover:outline-1 hover:outline-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground"
                          style={{ background: cor ?? "color-mix(in oklab, var(--foreground) 5%, transparent)" }}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <p aria-live="polite" className="min-h-4">
              {foco
                ? `${DIAS_SEMANA[foco.dia]}, ${foco.hora}h–${(foco.hora + 1) % 24}h: ${num(foco.total)} ocorrência${foco.total === 1 ? "" : "s"}`
                : "Passe o mouse sobre uma célula para ver o total."}
            </p>
            <div className="flex items-center gap-1.5" aria-hidden>
              <span>menos</span>
              {RAMPA.map((c) => (
                <span key={c} className="size-3 rounded-[3px]" style={{ background: c }} />
              ))}
              <span>mais</span>
            </div>
          </div>
        </>
      )}
    </Bloco>
  );
}
