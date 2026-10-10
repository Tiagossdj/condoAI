import type { Metadata } from "next";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { Nav } from "@/components/landing/Nav";
import { Accent } from "@/components/landing/SectionHeading";

export const metadata: Metadata = {
  title: "Painel — condoAI",
  description: "Detecções de descarte em tempo real, com contagem por classe.",
};

export default function DashboardPage() {
  return (
    <>
      <Nav page="dashboard" />
      <main className="mx-auto w-full max-w-6xl px-5 pt-24 pb-16 sm:px-8 sm:pt-28">
        <h1 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          Painel em <Accent>tempo real</Accent>.
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Cada detecção publicada no MQTT é persistida pelo backend e chega aqui via WebSocket,
          sem recarregar a página.
        </p>

        <div className="mt-8">
          <Dashboard />
        </div>
      </main>
    </>
  );
}
