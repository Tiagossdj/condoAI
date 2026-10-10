import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetectionPreview } from "./DetectionPreview";
import { Accent } from "./SectionHeading";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_oklab,var(--color-brand)_70%,transparent),transparent)]"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-32 pb-20 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-40 lg:pb-28">
        {/* Hero anima só com CSS: fica visível mesmo antes da hidratação */}
        <div className="animate-in duration-700 fade-in slide-in-from-bottom-4 motion-reduce:animate-none">
          <Badge variant="outline" className="h-auto gap-2 px-3 py-1 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-accent-warm" />
            TCC · Ciência da Computação · UNIP 2026
          </Badge>

          <h1 className="mt-6 text-4xl leading-[1.08] font-medium tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Detecção de <Accent>descarte</Accent> de resíduos em condomínios.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            Visão computacional com YOLOv8 integrada a uma arquitetura IoT via MQTT: resíduos
            deixados em áreas comuns são identificados e cada ocorrência aparece em um painel em
            tempo real.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="h-11 px-5 text-sm">
              <Link href="/scan">
                Testar agora
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="h-11 px-5 text-sm">
              <a href="#como-funciona">Como funciona</a>
            </Button>
          </div>

          <p className="mt-5 text-sm text-muted-foreground">
            Aberto ao público para teste, sem cadastro.
          </p>
        </div>

        <div className="animate-in delay-150 duration-700 fill-mode-backwards fade-in slide-in-from-bottom-4 motion-reduce:animate-none">
          <DetectionPreview />
        </div>
      </div>
    </section>
  );
}
