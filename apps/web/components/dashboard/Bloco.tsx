import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type BlocoProps = {
  titulo: string;
  subtitulo?: ReactNode;
  className?: string;
  children: ReactNode;
};

// Moldura comum dos blocos analíticos do painel (spec 8.2)
export function Bloco({ titulo, subtitulo, className, children }: BlocoProps) {
  return (
    <Card className={cn("min-w-0 gap-4 p-5", className)}>
      <div>
        <h2 className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          {titulo}
        </h2>
        {subtitulo && <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>}
      </div>
      {children}
    </Card>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-h-32 items-center justify-center text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
