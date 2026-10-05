"use client";

import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Inbox, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ClasseNome } from "@/lib/api";

// Formato único para itens vindos do REST (camera como objeto) e do
// WebSocket (camera_id + localizacao)
export type FeedItem = {
  id: number;
  timestamp: string;
  camera_id: string;
  localizacao: string;
  classe: ClasseNome;
  confianca: number;
  latencia_ms: number | null;
};

type DetectionFeedProps = {
  items: FeedItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

const horario = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });

export function DetectionFeed({ items, hasMore, loadingMore, onLoadMore }: DetectionFeedProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
        <Inbox className="size-6 text-accent-warm" strokeWidth={1.5} />
        <p className="font-medium">Nenhuma detecção ainda</p>
        <p className="text-sm text-muted-foreground">
          As detecções aparecem aqui em tempo real.{" "}
          <Link href="/scan" className="text-accent-warm underline-offset-4 hover:underline">
            Faça um teste
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="overflow-hidden rounded-2xl border">
        <ul className="max-h-[32rem] divide-y overflow-y-auto" data-testid="feed">
          {/* initial={false}: só itens novos (via WebSocket) animam a entrada */}
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, backgroundColor: "rgba(47, 44, 121, 0.9)" }}
                animate={{ opacity: 1, backgroundColor: "rgba(47, 44, 121, 0)" }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-4"
                data-id={item.id}
              >
                <span className="font-mono text-sm text-accent-warm">{item.classe}</span>
                <span className="font-mono text-sm">{Math.round(item.confianca * 100)}%</span>
                <span className="truncate text-xs text-muted-foreground">
                  {item.camera_id} · {item.localizacao}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {horario(item.timestamp)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        {hasMore && (
          <div className="border-t p-3">
            <Button
              variant="ghost"
              className="w-full"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore && <Loader2 data-icon="inline-start" className="animate-spin" />}
              Carregar mais
            </Button>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
