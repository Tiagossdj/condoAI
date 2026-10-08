"use client";

import { useEffect, useState } from "react";
import { Video, VideoOff } from "lucide-react";

// Sem sinal por mais que isso, a câmera é considerada offline (spec 8.2)
export const SEM_SINAL_S = 30;

export type CameraStatusItem = {
  camera_id: string;
  estado: "online" | "offline";
  modelo: string;
  fps: number | null;
  // Momento local (Date.now()) em que o backend recebeu o sinal: vem de
  // idade_s, para não depender do relógio do dispositivo (spec 7.2)
  recebidoEm: number;
};

function ha(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  if (segundos < 3600) return `${Math.floor(segundos / 60)} min`;
  return `${Math.floor(segundos / 3600)} h`;
}

export function CameraStatus({ cameras }: { cameras: CameraStatusItem[] }) {
  // Relógio local: atualiza "há N s" a cada segundo
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (cameras.length === 0) {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        data-testid="camera-status"
      >
        <VideoOff className="size-4" strokeWidth={1.5} />
        Nenhuma câmera conectada
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-live="polite" data-testid="camera-status">
      {cameras.map((c) => {
        const idade = Math.max(0, Math.floor((agora - c.recebidoEm) / 1000));
        const semSinal = c.estado === "online" && idade > SEM_SINAL_S;
        const online = c.estado === "online" && !semSinal;
        const Icon = online ? Video : VideoOff;

        return (
          <li
            key={c.camera_id}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
            data-camera={c.camera_id}
            data-online={online}
          >
            <Icon
              className={online ? "size-4 text-accent-warm" : "size-4 text-muted-foreground"}
              strokeWidth={1.5}
            />
            <span className="font-mono">{c.camera_id}</span>
            <span className="text-muted-foreground">·</span>
            {online ? (
              <>
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="size-2 animate-pulse rounded-full bg-accent-warm" />
                  monitorando
                </span>
                <span className="text-muted-foreground">
                  · último sinal há {ha(idade)} · modelo {c.modelo}
                  {c.fps !== null && ` · ${Math.round(c.fps)} fps`}
                </span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-destructive">
                  <span className="size-2 rounded-full bg-destructive" />
                  offline
                </span>
                <span className="text-muted-foreground">
                  · {semSinal ? `sem sinal há ${ha(idade)}` : `desde há ${ha(idade)}`}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
