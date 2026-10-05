import { Reveal } from "./Reveal";

type SectionHeadingProps = {
  index: string;
  eyebrow: string;
  children: React.ReactNode;
  description?: string;
};

export function SectionHeading({ index, eyebrow, children, description }: SectionHeadingProps) {
  return (
    <Reveal className="max-w-2xl">
      <p className="font-mono text-xs tracking-widest text-accent-warm uppercase">
        {index} — {eyebrow}
      </p>
      <h2 className="mt-4 text-3xl font-medium tracking-tight text-balance sm:text-4xl">
        {children}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
          {description}
        </p>
      )}
    </Reveal>
  );
}

// Trecho de destaque em serifa itálica, na cor quente da paleta
export function Accent({ children }: { children: React.ReactNode }) {
  return <em className="font-serif text-[1.08em] font-normal text-accent-warm">{children}</em>;
}
