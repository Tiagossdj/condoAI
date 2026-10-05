import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b bg-background/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="text-lg font-medium tracking-tight">
          condo<span className="font-serif text-xl text-accent-warm italic">AI</span>
        </Link>
        <Button asChild variant="outline" size="lg" className="h-9 px-4">
          <Link href="/scan">
            Testar agora
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </nav>
    </header>
  );
}
