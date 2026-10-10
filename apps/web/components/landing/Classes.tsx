import { CupSoda, Package, ShoppingBag, Trash2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

// As 4 classes fixas do modelo (spec 3.2), na ordem do data.yaml
const CLASSES = [
  { icon: ShoppingBag, nome: "saco_lixo", descricao: "Saco plástico de lixo" },
  { icon: CupSoda, nome: "garrafa_pet", descricao: "Garrafa PET" },
  { icon: Package, nome: "papelao", descricao: "Caixas de papelão" },
  { icon: Trash2, nome: "lixo_generico", descricao: "Outros resíduos não classificados" },
];

export function Classes() {
  return (
    <section className="border-t">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        <SectionHeading
          index="02"
          eyebrow="O que detecta"
          description="O modelo é treinado com imagens dos datasets TACO, TrashNet++ e WasteInsight, em quatro classes de resíduos."
        >
          Quatro classes, <Accent>nada além</Accent>.
        </SectionHeading>

        <div className="mt-14 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {CLASSES.map(({ icon: Icon, nome, descricao }, i) => (
            <Reveal key={nome} delay={i * 0.08}>
              <Card className="h-full gap-0 p-5 sm:p-6">
                <Icon className="size-6 text-accent-warm" strokeWidth={1.5} />
                <p className="mt-8 font-mono text-sm text-foreground">{nome}</p>
                <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
