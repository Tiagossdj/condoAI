import { Classes } from "@/components/landing/Classes";
import { ComoFunciona } from "@/components/landing/ComoFunciona";
import { CtaFinal, Footer } from "@/components/landing/CtaFinal";
import { Hero } from "@/components/landing/Hero";
import { Metas } from "@/components/landing/Metas";
import { Nav } from "@/components/landing/Nav";
import { Privacidade } from "@/components/landing/Privacidade";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ComoFunciona />
        <Classes />
        <Privacidade />
        <Metas />
        <CtaFinal />
      </main>
      <Footer />
    </>
  );
}
