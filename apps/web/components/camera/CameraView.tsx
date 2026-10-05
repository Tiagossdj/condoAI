"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, Loader2, VideoOff } from "lucide-react";

import { Button } from "@/components/ui/button";

const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.9;

type Status = "starting" | "live" | "denied" | "unavailable" | "insecure";

// Redesenha a imagem num canvas (lado máximo de 1280 px) e exporta JPEG.
// Padroniza o envio e descarta metadados EXIF das fotos — inclusive GPS.
function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("falha ao gerar a imagem"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

type CameraViewProps = {
  onCapture: (frame: Blob) => void;
  disabled?: boolean;
};

export function CameraView({ onCapture, disabled = false }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("starting");

  useEffect(() => {
    // getUserMedia só existe em contexto seguro (HTTPS ou localhost).
    // Pela LAN via HTTP (ex.: celular), cai no fallback de arquivo (spec 8.2).
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("insecure");
      return;
    }

    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: MAX_SIDE } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setStatus("live");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        setStatus(name === "NotAllowedError" ? "denied" : "unavailable");
      });

    // Desliga a câmera ao sair da tela
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function captureFromVideo() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    onCapture(await toJpeg(video, video.videoWidth, video.videoHeight));
  }

  async function captureFromFile(file: File | undefined) {
    if (!file) return;
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      onCapture(await toJpeg(bitmap, bitmap.width, bitmap.height));
    } finally {
      bitmap.close();
    }
  }

  const live = status === "live";

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border bg-card sm:aspect-[4/3]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={live ? "size-full object-cover" : "hidden"}
        />

        {!live && (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
            {status === "starting" ? (
              <>
                <Loader2 className="size-6 animate-spin text-accent-warm" />
                <p className="text-sm text-muted-foreground">Solicitando acesso à câmera…</p>
              </>
            ) : (
              <>
                <VideoOff className="size-6 text-accent-warm" strokeWidth={1.5} />
                <p className="max-w-xs text-sm text-muted-foreground">
                  {status === "denied" && "O acesso à câmera foi negado. Libere a permissão no navegador ou envie uma foto."}
                  {status === "unavailable" && "Nenhuma câmera disponível neste dispositivo. Envie uma foto."}
                  {status === "insecure" && "A câmera ao vivo exige HTTPS. Use a câmera do aparelho para tirar uma foto."}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {live ? (
        <Button size="lg" className="h-12 text-base" onClick={captureFromVideo} disabled={disabled}>
          <Camera data-icon="inline-start" />
          Capturar
        </Button>
      ) : (
        status !== "starting" && (
          <Button asChild size="lg" className="h-12 text-base" aria-disabled={disabled}>
            <label className={disabled ? "pointer-events-none opacity-50" : "cursor-pointer"}>
              <ImageUp data-icon="inline-start" />
              {status === "insecure" ? "Tirar foto" : "Enviar foto"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={disabled}
                onChange={(e) => {
                  void captureFromFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
        )
      )}
    </div>
  );
}
