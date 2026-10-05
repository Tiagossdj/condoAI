"use client";

import { MotionConfig, motion } from "motion/react";
import { ShoppingBag } from "lucide-react";

// Ilustração do que o sistema faz: um frame de câmera com a bounding box de
// uma detecção e o payload MQTT correspondente (spec 4.2). Feita só com CSS
// e ícone — nenhuma imagem real, coerente com a seção de LGPD.
export function DetectionPreview() {
  return (
    <MotionConfig reducedMotion="user">
      <figure className="relative overflow-hidden rounded-2xl border bg-card/60 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="flex items-center justify-between border-b px-4 py-3 font-mono text-[11px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="size-1.5 animate-pulse rounded-full bg-accent-warm" />
            cam_hall · Hall de entrada
          </span>
          <span>ilustração</span>
        </div>

        <div className="relative aspect-[4/3] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:28px_28px]">
          <motion.div
            aria-hidden
            className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-accent-warm/70 to-transparent"
            initial={{ top: "0%" }}
            animate={{ top: ["0%", "100%"] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
          />

          <motion.div
            className="absolute top-[30%] left-[28%] h-[48%] w-[40%] rounded-md border-2 border-accent-warm"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="absolute -top-7 left-[-2px] rounded-t-md bg-accent-warm px-2 py-1 font-mono text-[11px] font-medium text-bg-deep">
              saco_lixo · 0.85
            </span>
            <div className="flex h-full items-center justify-center">
              <ShoppingBag className="size-1/2 text-accent-light/25" strokeWidth={1} />
            </div>
          </motion.div>
        </div>

        <figcaption className="border-t px-4 py-3 font-mono text-[11px] leading-relaxed break-all text-muted-foreground">
          <span className="text-accent-warm">condoai/deteccoes</span>{" "}
          {'{"classe":"saco_lixo","confianca":0.847,"latencia_ms":214}'}
        </figcaption>
      </figure>
    </MotionConfig>
  );
}
