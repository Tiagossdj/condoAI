import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "./Reveal";
import { Accent } from "./SectionHeading";

export function CtaFinal() {
  return (
    <section className="relative isolate overflow-hidden border-t">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-full bg-[radial-gradient(ellipse_60%_80%_at_50%_100%,color-mix(in_oklab,var(--color-brand)_60%,transparent),transparent)]"
      />
      <Reveal className="mx-auto flex max-w-6xl flex-col items-center px-5 py-28 text-center sm:px-8 lg:py-36">
        <h2 className="max-w-2xl text-3xl font-medium tracking-tight text-balance sm:text-5xl">
          Aponte a câmera e <Accent>veja o modelo trabalhar</Accent>.
        </h2>
        <p className="mt-5 max-w-md text-muted-foreground">
          Capture uma imagem pelo celular ou pelo computador e receba a classe detectada e a
          confiança.
        </p>
        <Button asChild size="lg" className="mt-9 h-11 px-6 text-sm">
          <Link href="/scan">
            Testar agora
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>
          condo<span className="font-serif text-accent-warm italic">AI</span> · Trabalho de Conclusão
          de Curso
        </p>
        <p>Ciência da Computação · UNIP · 2026</p>
      </div>
    </footer>
  );
}
