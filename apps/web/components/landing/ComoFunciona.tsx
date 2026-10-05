import { Camera, LayoutDashboard, RadioTower, ScanSearch } from "lucide-react";

import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

// Espelha a arquitetura de quatro camadas desacopladas (spec 2.1)
const ETAPAS = [
  {
    icon: Camera,
    titulo: "Captura",
    texto: "Uma câmera fixa ou o celular envia os frames da área comum.",
  },
  {
    icon: ScanSearch,
    titulo: "Inferência",
    texto: "O YOLOv8 classifica o resíduo. Detecções com confiança abaixo de 40% são descartadas.",
  },
  {
    icon: RadioTower,
    titulo: "Mensageria",
    texto: "O evento é publicado via MQTT. Câmera e backend não se conhecem: cada camada é independente.",
  },
  {
    icon: LayoutDashboard,
    titulo: "Painel",
    texto: "O backend persiste no PostgreSQL e transmite via WebSocket ao dashboard, em tempo real.",
  },
];

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        <SectionHeading
          index="01"
          eyebrow="Como funciona"
          description="Um pipeline de ponta a ponta, da câmera ao painel, com camadas desacopladas pelo protocolo MQTT."
        >
          Da imagem ao alerta em <Accent>quatro etapas</Accent>.
        </SectionHeading>

        <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {ETAPAS.map(({ icon: Icon, titulo, texto }, i) => (
            <li key={titulo} className="bg-background">
              <Reveal delay={i * 0.08} className="flex h-full flex-col p-6 lg:p-7">
                <div className="flex items-center justify-between">
                  <Icon className="size-5 text-accent-warm" strokeWidth={1.5} />
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-8 text-lg font-medium">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{texto}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
