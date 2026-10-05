import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

// variant "back": usada em telas internas (ex.: /scan), troca o CTA por "Início"
export function Nav({ variant = "cta" }: { variant?: "cta" | "back" }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b bg-background/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="text-lg font-medium tracking-tight">
          condo<span className="font-serif text-xl text-accent-warm italic">AI</span>
        </Link>
        {variant === "cta" ? (
          <Button asChild variant="outline" size="lg" className="h-9 px-4">
            <Link href="/scan">
              Testar agora
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        ) : (
          <Button asChild variant="ghost" size="lg" className="h-9 px-3">
            <Link href="/">
              <ArrowLeft data-icon="inline-start" />
              Início
            </Link>
          </Button>
        )}
      </nav>
    </header>
  );
}
