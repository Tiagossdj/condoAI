import { META_H1_MAP50, METRICAS_MODELO, MODELO_PADRAO } from "@/lib/modelo";
import { Bloco } from "./Bloco";

const fmt = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

// Versão em produção (do sinal de vida da câmera, spec 4.7) e mAP@50 no teste
export function Modelo({ versao }: { versao: string | null }) {
  const v = versao ?? MODELO_PADRAO;
  const m = METRICAS_MODELO[v];
  return (
    <Bloco titulo="Modelo" subtitulo={versao ? "Informado pela câmera" : "Versão configurada (nenhuma câmera online)"}>
      <div className="flex items-baseline gap-3">
        <p className="font-mono text-3xl text-accent-warm">YOLOv8n {v}</p>
      </div>
      {m ? (
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">mAP@50 (teste)</dt>
            <dd className="tabular-nums">{fmt(m.map50)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Meta H1</dt>
            <dd className="tabular-nums">
              ≥ {fmt(META_H1_MAP50)} {m.map50 >= META_H1_MAP50 ? "· atingida" : "· não atingida"}
            </dd>
          </div>
          <p className="text-xs text-muted-foreground">{m.observacao}</p>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Sem métricas registradas para esta versão.</p>
      )}
    </Bloco>
  );
}
