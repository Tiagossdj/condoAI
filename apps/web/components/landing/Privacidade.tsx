import { EyeOff, ImageOff, ShieldCheck } from "lucide-react";

import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

// Medidas de LGPD descritas na spec (seção 5)
const PRINCIPIOS = [
  {
    icon: EyeOff,
    titulo: "Sem a classe “pessoa”",
    texto: "O modelo é treinado exclusivamente nas quatro classes de resíduos. Pessoas não fazem parte do dataset.",
  },
  {
    icon: ShieldCheck,
    titulo: "Filtro por índice e nome",
    texto: "Cada detecção é conferida contra a lista de classes. Um modelo pré-treinado que reconheça pessoas é bloqueado no código.",
  },
  {
    icon: ImageOff,
    titulo: "Nenhuma imagem armazenada",
    texto: "Os frames são processados em memória. Só o evento — classe, confiança, câmera e horário — é registrado.",
  },
];

export function Privacidade() {
  return (
    <section className="border-t">
      <div className="mx-auto grid max-w-6xl gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:py-32">
        <SectionHeading
          index="03"
          eyebrow="Privacidade (LGPD)"
          description="O sistema observa resíduos, não pessoas. Nenhum dado pessoal é coletado, processado ou persistido."
        >
          Privacidade <Accent>por design</Accent>, não por política.
        </SectionHeading>

        <ul className="divide-y border-y">
          {PRINCIPIOS.map(({ icon: Icon, titulo, texto }, i) => (
            <li key={titulo}>
              <Reveal delay={i * 0.08} className="flex gap-5 py-6">
                <Icon className="mt-0.5 size-5 shrink-0 text-accent-warm" strokeWidth={1.5} />
                <div>
                  <h3 className="font-medium">{titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{texto}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
