"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { scanFrame, type ScanResponse } from "@/lib/api";
import { CameraView } from "./CameraView";
import { ResultCard } from "./ResultCard";

const CAMERA_ID = "cam_test";

type Phase =
  | { name: "capture" }
  | { name: "loading"; url: string }
  | { name: "error"; url: string; message: string }
  | { name: "done"; url: string; result: ScanResponse };

// Orquestra a tela /scan: câmera → POST /scan → foto congelada + ResultCard
export function ScanFlow() {
  const [phase, setPhase] = useState<Phase>({ name: "capture" });
  const url = phase.name === "capture" ? null : phase.url;

  // A prévia existe só em memória (object URL) e é liberada ao trocar de fase
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  async function handleCapture(frame: Blob) {
    const frameUrl = URL.createObjectURL(frame);
    setPhase({ name: "loading", url: frameUrl });
    try {
      const result = await scanFrame(frame, CAMERA_ID);
      setPhase({ name: "done", url: frameUrl, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      setPhase({ name: "error", url: frameUrl, message });
    }
  }

  if (phase.name === "capture") {
    return <CameraView onCapture={handleCapture} />;
  }

  const bbox = phase.name === "done" ? phase.result.bbox : null;

  return (
    <div className="flex flex-col gap-4">
      <Snapshot url={phase.url} bbox={bbox} label={phase.name === "done" ? phase.result : null} />

      {phase.name === "loading" && <ResultCard state="loading" />}
      {phase.name === "error" && <ResultCard state="error" message={phase.message} />}
      {phase.name === "done" && <ResultCard state="done" result={phase.result} />}

      <Button
        variant="outline"
        size="lg"
        className="h-12 text-base"
        disabled={phase.name === "loading"}
        onClick={() => setPhase({ name: "capture" })}
      >
        <RotateCcw data-icon="inline-start" />
        Nova captura
      </Button>
    </div>
  );
}

type SnapshotProps = {
  url: string;
  bbox: [number, number, number, number] | null;
  label: ScanResponse | null;
};

// Foto capturada com a bounding box sobreposta (coordenadas em pixels da imagem)
function Snapshot({ url, bbox, label }: SnapshotProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element -- object URL local, sem otimização */}
      <img
        src={url}
        alt="Imagem capturada"
        className="block h-auto w-full"
        onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
      {bbox && size && label?.classe && (
        <div
          className="absolute rounded-md border-2 border-accent-warm"
          style={{
            left: `${(bbox[0] / size.w) * 100}%`,
            top: `${(bbox[1] / size.h) * 100}%`,
            width: `${((bbox[2] - bbox[0]) / size.w) * 100}%`,
            height: `${((bbox[3] - bbox[1]) / size.h) * 100}%`,
          }}
        >
          <span className="absolute -top-6 left-[-2px] rounded-t-md bg-accent-warm px-1.5 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap text-bg-deep">
            {label.classe} · {label.confianca?.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
