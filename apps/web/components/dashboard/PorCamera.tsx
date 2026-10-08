"use client";

import type { Painel } from "@/lib/api";
import { dataHora, num } from "@/lib/painel";
import { Bloco } from "./Bloco";
import { SEM_SINAL_S, type CameraStatusItem } from "./CameraStatus";

type PorCameraProps = {
  painel: Painel;
  status: Record<string, CameraStatusItem>;
  agora: number;
  className?: string;
};

function estadoDa(s: CameraStatusItem | undefined, agora: number) {
  if (!s) return { texto: "sem sinal", online: false };
  const idade = (agora - s.recebidoEm) / 1000;
  return s.estado === "online" && idade <= SEM_SINAL_S
    ? { texto: "monitorando", online: true }
    : { texto: "offline", online: false };
}

// Onde o problema acontece: câmeras ativas, inclusive sem ocorrências (spec 8.2).
// O estado vem dos eventos "status" do WebSocket, não do /painel
export function PorCamera({ painel, status, agora, className }: PorCameraProps) {
  return (
    <Bloco titulo="Por câmera" subtitulo="Ocorrências no período por local monitorado" className={className}>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b text-left font-mono text-xs text-muted-foreground">
              <th scope="col" className="px-5 pb-2 font-normal">Câmera</th>
              <th scope="col" className="pb-2 font-normal">Estado</th>
              <th scope="col" className="pb-2 text-right font-normal">Ocorrências</th>
              <th scope="col" className="px-5 pb-2 text-right font-normal">Última</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {painel.por_camera.map((c) => {
              const e = estadoDa(status[c.camera_id], agora);
              return (
                <tr key={c.camera_id} data-camera={c.camera_id}>
                  <td className="px-5 py-3">
                    <p className="font-mono">{c.camera_id}</p>
                    <p className="text-xs text-muted-foreground">{c.localizacao}</p>
                  </td>
                  <td className="py-3">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={
                          e.online
                            ? "size-2 animate-pulse rounded-full bg-accent-warm"
                            : "size-2 rounded-full bg-muted-foreground"
                        }
                      />
                      <span className={e.online ? "" : "text-muted-foreground"}>{e.texto}</span>
                    </span>
                  </td>
                  <td className="py-3 text-right tabular-nums">{num(c.total)}</td>
                  <td className="px-5 py-3 text-right text-xs text-muted-foreground tabular-nums">
                    {c.ultima ? dataHora(c.ultima) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Bloco>
  );
}
