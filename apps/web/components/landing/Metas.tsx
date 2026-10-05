import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

// Hipóteses de pesquisa (spec 1.4) — metas a validar, não resultados
const HIPOTESES = [
  {
    id: "H1",
    valor: "≥ 65,9%",
    metrica: "mAP@50",
    texto: "Precisão do modelo com quatro classes simultâneas, tendo como referência o benchmark de Aguiar (2024).",
  },
  {
    id: "H2",
    valor: "< 3 s",
    metrica: "Latência do pipeline",
    texto: "Tempo total da captura do frame até o backend, em execução local.",
  },
];

export function Metas() {
  return (
    <section className="border-t">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        <SectionHeading
          index="04"
          eyebrow="Metas da pesquisa"
          description="O objetivo é demonstrar a viabilidade técnica do pipeline. Estas são as hipóteses que o trabalho vai testar."
        >
          O que <Accent>pretendemos provar</Accent>.
        </SectionHeading>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {HIPOTESES.map(({ id, valor, metrica, texto }, i) => (
            <Reveal key={id} delay={i * 0.1}>
              <Card className="h-full gap-0 p-7 sm:p-8">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    Hipótese {id}
                  </span>
                  <Badge variant="outline" className="text-muted-foreground">
                    a validar
                  </Badge>
                </div>
                <p className="mt-10 font-serif text-6xl text-accent-warm sm:text-7xl">{valor}</p>
                <p className="mt-3 font-medium">{metrica}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{texto}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
