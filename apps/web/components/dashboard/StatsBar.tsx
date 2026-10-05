"use client";

import { MotionConfig, motion } from "motion/react";
import { CupSoda, Package, ShoppingBag, Trash2, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { ClasseNome } from "@/lib/api";
import { CLASSES } from "@/lib/classes";

const ICONES: Record<ClasseNome, LucideIcon> = {
  saco_lixo: ShoppingBag,
  garrafa_pet: CupSoda,
  papelao: Package,
  lixo_generico: Trash2,
};

type StatsBarProps = {
  total: number;
  porClasse: Record<ClasseNome, number>;
};

// O número "pisca" ao mudar: a key nova remonta o span e reexecuta a animação
function Contador({ value, className }: { value: number; className?: string }) {
  return (
    <motion.span
      key={value}
      className={className}
      initial={{ opacity: 0.2, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {value}
    </motion.span>
  );
}

export function StatsBar({ total, porClasse }: StatsBarProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Card className="col-span-2 gap-0 bg-brand/40 p-5 lg:col-span-1">
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Total
          </p>
          <Contador value={total} className="mt-3 block font-serif text-5xl text-accent-warm" />
          <p className="mt-1 text-sm text-muted-foreground">detecções registradas</p>
        </Card>

        {CLASSES.map(({ nome, descricao }) => {
          const Icon = ICONES[nome];
          return (
            <Card key={nome} className="gap-0 p-5" data-classe={nome}>
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-accent-warm" strokeWidth={1.5} />
                <Contador value={porClasse[nome]} className="font-mono text-2xl" />
              </div>
              <p className="mt-6 font-mono text-sm">{nome}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{descricao}</p>
            </Card>
          );
        })}
      </div>
    </MotionConfig>
  );
}
