import type { Metadata } from "next";

import { ScanFlow } from "@/components/camera/ScanFlow";
import { Nav } from "@/components/landing/Nav";
import { Accent } from "@/components/landing/SectionHeading";

export const metadata: Metadata = {
  title: "Testar — condoAI",
  description: "Capture uma imagem e veja a classe de resíduo detectada pelo modelo YOLOv8.",
};

export default function ScanPage() {
  return (
    <>
      <Nav variant="back" />
      <main className="mx-auto w-full max-w-xl px-5 pt-24 pb-16 sm:px-8 sm:pt-28">
        <h1 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          Aponte para o <Accent>resíduo</Accent>.
        </h1>
        <p className="mt-3 text-muted-foreground">
          Capture uma imagem e o modelo identifica a classe e a confiança. A imagem não é
          armazenada.
        </p>

        <div className="mt-8">
          <ScanFlow />
        </div>
      </main>
    </>
  );
}
