import Link from "next/link";
import { AlertCircle, ArrowRight, Loader2, SearchX } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { ScanResponse } from "@/lib/api";
import { DESCRICOES } from "@/lib/classes";

type ResultCardProps =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; result: ScanResponse };

export function ResultCard(props: ResultCardProps) {
  if (props.state === "loading") {
    return (
      <Card className="flex-row items-center gap-3 p-5" aria-live="polite">
        <Loader2 className="size-5 animate-spin text-accent-warm" />
        <p className="text-sm text-muted-foreground">Analisando a imagem…</p>
      </Card>
    );
  }

  if (props.state === "error") {
    return (
      <Card className="flex-row items-start gap-3 p-5" role="alert">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">Não foi possível analisar</p>
          <p className="mt-1 text-sm text-muted-foreground">{props.message}</p>
        </div>
      </Card>
    );
  }

  const { classe, confianca, latencia_ms, timestamp } = props.result;
  const horario = new Date(timestamp).toLocaleString("pt-BR");

  if (classe === null || confianca === null) {
    return (
      <Card className="flex-row items-start gap-3 p-5" aria-live="polite">
        <SearchX className="mt-0.5 size-5 shrink-0 text-accent-warm" strokeWidth={1.5} />
        <div>
          <p className="font-medium">Nenhum resíduo detectado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tente aproximar o objeto ou melhorar a iluminação.
          </p>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {horario} · {latencia_ms} ms
          </p>
        </div>
      </Card>
    );
  }

  const pct = Math.round(confianca * 100);

  return (
    <Card className="gap-0 p-6" aria-live="polite" data-testid="result-card">
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
        Classe detectada
      </p>
      <p className="mt-3 font-mono text-2xl text-accent-warm">{classe}</p>
      <p className="mt-1 text-sm text-muted-foreground">{DESCRICOES[classe]}</p>

      <div className="mt-6">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Confiança</span>
          <span className="font-mono">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-accent-warm" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="font-mono text-xs text-muted-foreground">
          {horario} · {latencia_ms} ms
        </p>
        <Link
          href="/dashboard"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-accent-warm underline-offset-4 hover:underline"
        >
          Ver no painel
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}
