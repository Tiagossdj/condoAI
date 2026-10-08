"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import {
  ClasseNomeSchema,
  getDeteccoes,
  getEstatisticas,
  type ClasseNome,
  type Deteccao,
} from "@/lib/api";
import { useWebSocket, type WsDeteccaoEvent, type WsStatusEvent } from "@/lib/websocket";
import { CameraStatus, type CameraStatusItem } from "./CameraStatus";
import { DetectionFeed, type FeedItem } from "./DetectionFeed";
import { StatsBar } from "./StatsBar";

const PAGE_SIZE = 30;

const ZERO: Record<ClasseNome, number> = {
  saco_lixo: 0,
  garrafa_pet: 0,
  papelao: 0,
  lixo_generico: 0,
};

function fromRest(d: Deteccao): FeedItem {
  return {
    id: d.id,
    timestamp: d.timestamp,
    camera_id: d.camera.camera_id,
    localizacao: d.camera.localizacao,
    classe: ClasseNomeSchema.parse(d.classe.nome),
    confianca: d.confianca,
    latencia_ms: d.latencia_ms,
  };
}

function fromWs({ data }: WsDeteccaoEvent): FeedItem | null {
  const classe = ClasseNomeSchema.safeParse(data.classe);
  return classe.success ? { ...data, classe: classe.data } : null;
}

function fromStatus({ data }: WsStatusEvent): CameraStatusItem {
  const { camera_id, estado, modelo, fps, idade_s } = data;
  return { camera_id, estado, modelo, fps, recebidoEm: Date.now() - idade_s * 1000 };
}

// Junta listas sem repetir id, da mais recente para a mais antiga
function merge(a: FeedItem[], b: FeedItem[]): FeedItem[] {
  const porId = new Map<number, FeedItem>();
  for (const item of [...a, ...b]) porId.set(item.id, item);
  return [...porId.values()].sort(
    (x, y) => y.timestamp.localeCompare(x.timestamp) || y.id - x.id,
  );
}

type Stats = { total: number; porClasse: Record<ClasseNome, number> };

export function Dashboard() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cameras, setCameras] = useState<Record<string, CameraStatusItem>>({});

  // Maior id já contado em /estatisticas (spec 7.1). undefined = ainda
  // carregando: eventos desse intervalo ficam pendentes até a resposta
  const ultimoIdRef = useRef<number | null | undefined>(undefined);
  const pendentesRef = useRef<FeedItem[]>([]);

  const contar = useCallback((novos: FeedItem[]) => {
    const ultimo = ultimoIdRef.current ?? 0;
    const validos = novos.filter((i) => i.id > ultimo);
    if (validos.length === 0) return;
    ultimoIdRef.current = Math.max(ultimo, ...validos.map((i) => i.id));
    setStats((s) => {
      if (!s) return s;
      const porClasse = { ...s.porClasse };
      for (const i of validos) porClasse[i.classe] += 1;
      return { total: s.total + validos.length, porClasse };
    });
  }, []);

  const { connected } = useWebSocket(undefined, (event) => {
    if (event.event === "status") {
      const status = fromStatus(event);
      setCameras((prev) => ({ ...prev, [status.camera_id]: status }));
      return;
    }
    const item = fromWs(event);
    if (!item) return;
    setItems((prev) => merge([item], prev));
    if (ultimoIdRef.current === undefined) pendentesRef.current.push(item);
    else contar([item]);
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getEstatisticas(), getDeteccoes({ limite: PAGE_SIZE })])
      .then(([est, hist]) => {
        if (cancelled) return;
        const porClasse = { ...ZERO };
        for (const { classe, total } of est.por_classe) porClasse[classe] = total;
        setStats({ total: est.total, porClasse });
        ultimoIdRef.current = est.ultimo_id;
        contar(pendentesRef.current);
        pendentesRef.current = [];

        setItems((prev) => merge(prev, hist.data.map(fromRest)));
        setCursor(hist.next_cursor);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "erro desconhecido");
      });
    return () => {
      cancelled = true;
    };
  }, [contar]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await getDeteccoes({ limite: PAGE_SIZE, cursor });
      setItems((prev) => merge(prev, page.data.map(fromRest)));
      setCursor(page.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro desconhecido");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm" aria-live="polite" data-testid="status">
          <span
            className={
              connected
                ? "size-2 animate-pulse rounded-full bg-accent-warm"
                : "size-2 rounded-full bg-muted-foreground"
            }
          />
          <span className={connected ? "text-foreground" : "text-muted-foreground"}>
            {connected ? "Ao vivo" : "Reconectando…"}
          </span>
        </div>
        <section aria-label="Câmeras">
          <CameraStatus
            cameras={Object.values(cameras).sort((a, b) => a.camera_id.localeCompare(b.camera_id))}
          />
        </section>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-destructive/40 p-5"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não foi possível carregar o painel</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {stats ? (
        <>
          <section aria-label="Contagem por classe">
            <StatsBar total={stats.total} porClasse={stats.porClasse} />
          </section>
          <section aria-label="Detecções recentes">
            <h2 className="mb-4 font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Detecções recentes
            </h2>
            <DetectionFeed
              items={items}
              hasMore={cursor !== null}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
            />
          </section>
        </>
      ) : (
        !error && (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-accent-warm" />
            Carregando detecções…
          </div>
        )
      )}
    </div>
  );
}
