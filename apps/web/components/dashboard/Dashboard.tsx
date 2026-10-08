"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import {
  ClasseNomeSchema,
  getDeteccoes,
  getEstatisticas,
  getPainel,
  PERIODOS,
  type ClasseNome,
  type Deteccao,
  type Painel,
  type Periodo,
} from "@/lib/api";
import { CLASSES } from "@/lib/classes";
import { ROTULO_PERIODO, ROTULO_PERIODO_CURTO } from "@/lib/painel";
import { cn } from "@/lib/utils";
import { useWebSocket, type WsDeteccaoEvent, type WsStatusEvent } from "@/lib/websocket";
import { CameraStatus, SEM_SINAL_S, type CameraStatusItem } from "./CameraStatus";
import { Confianca } from "./Confianca";
import { DetectionFeed, type FeedItem } from "./DetectionFeed";
import { Indicadores } from "./Indicadores";
import { Latencia } from "./Latencia";
import { LinhaDoTempo } from "./LinhaDoTempo";
import { MapaDeCalor } from "./MapaDeCalor";
import { Modelo } from "./Modelo";
import { PorCamera } from "./PorCamera";
import { PorClasse } from "./PorClasse";
import { StatsBar } from "./StatsBar";

const PAGE_SIZE = 30;

// Eventos próximos (ex.: várias classes confirmadas juntas) viram um único
// recarregamento do /painel (spec 8.2)
const RECARGA_PAINEL_MS = 1500;

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
type Filtros = { classe?: ClasseNome; camera_id?: string };

const selectCls =
  "h-9 rounded-lg border bg-card px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function Dashboard() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cameras, setCameras] = useState<Record<string, CameraStatusItem>>({});
  const [periodo, setPeriodo] = useState<Periodo>("24h");
  const [painel, setPainel] = useState<Painel | null>(null);
  const [recarregando, setRecarregando] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>({});
  const [agora, setAgora] = useState(() => Date.now());

  // Maior id já contado em /estatisticas (spec 7.1). undefined = ainda
  // carregando: eventos desse intervalo ficam pendentes até a resposta
  const ultimoIdRef = useRef<number | null | undefined>(undefined);
  const pendentesRef = useRef<FeedItem[]>([]);
  const recargaRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Ignora respostas de um período anterior que cheguem fora de ordem
  const pedidoRef = useRef(0);
  const filtrosRef = useRef(filtros);
  const deRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    filtrosRef.current = filtros;
    deRef.current = painel?.de;
  });

  // Relógio para "monitorando/offline" na tabela por câmera e nos indicadores
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const carregarPainel = useCallback(async (p: Periodo) => {
    const pedido = ++pedidoRef.current;
    setRecarregando(true);
    try {
      const dados = await getPainel(p);
      if (pedido === pedidoRef.current) setPainel(dados);
    } catch (err) {
      if (pedido === pedidoRef.current) {
        setError(err instanceof Error ? err.message : "erro desconhecido");
      }
    } finally {
      if (pedido === pedidoRef.current) setRecarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarPainel(periodo);
  }, [periodo, carregarPainel]);

  useEffect(() => () => clearTimeout(recargaRef.current), []);

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

    // Feed: só entra se respeita os filtros e o período atuais
    const f = filtrosRef.current;
    const de = deRef.current;
    if (
      (!f.classe || f.classe === item.classe) &&
      (!f.camera_id || f.camera_id === item.camera_id) &&
      (!de || item.timestamp >= de)
    ) {
      setItems((prev) => merge([item], prev));
    }

    if (ultimoIdRef.current === undefined) pendentesRef.current.push(item);
    else contar([item]);

    clearTimeout(recargaRef.current);
    recargaRef.current = setTimeout(() => void carregarPainel(periodo), RECARGA_PAINEL_MS);
  });

  // Totais acumulados (StatsBar): uma vez; depois incrementados pelo WebSocket
  useEffect(() => {
    let cancelled = false;
    getEstatisticas()
      .then((est) => {
        if (cancelled) return;
        const porClasse = { ...ZERO };
        for (const { classe, total } of est.por_classe) porClasse[classe] = total;
        setStats({ total: est.total, porClasse });
        ultimoIdRef.current = est.ultimo_id;
        contar(pendentesRef.current);
        pendentesRef.current = [];
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "erro desconhecido");
      });
    return () => {
      cancelled = true;
    };
  }, [contar]);

  // Feed: recarrega quando mudam os filtros ou o início do período
  const deFeed = painel?.de;
  useEffect(() => {
    if (!deFeed) return;
    let cancelled = false;
    getDeteccoes({ limite: PAGE_SIZE, ...filtros, de: deFeed })
      .then((hist) => {
        if (cancelled) return;
        setItems(hist.data.map(fromRest));
        setCursor(hist.next_cursor);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "erro desconhecido");
      });
    return () => {
      cancelled = true;
    };
  }, [filtros, deFeed]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await getDeteccoes({ limite: PAGE_SIZE, cursor, ...filtros, de: deFeed });
      setItems((prev) => merge(prev, page.data.map(fromRest)));
      setCursor(page.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro desconhecido");
    } finally {
      setLoadingMore(false);
    }
  }

  const listaCameras = Object.values(cameras).sort((a, b) => a.camera_id.localeCompare(b.camera_id));
  const online = listaCameras.filter(
    (c) => c.estado === "online" && (agora - c.recebidoEm) / 1000 <= SEM_SINAL_S,
  );
  const versaoModelo = online[0]?.modelo ?? null;

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
          <CameraStatus cameras={listaCameras} />
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

      {/* Seletor de período: um só, acima de tudo o que ele filtra */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Período" className="inline-flex items-center gap-1 rounded-lg border p-1">
          <span className="px-2 text-xs text-muted-foreground">Período</span>
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={periodo === p}
              onClick={() => setPeriodo(p)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                periodo === p
                  ? "bg-brand text-foreground"
                  : "text-muted-foreground hover:bg-foreground/5",
              )}
            >
              {ROTULO_PERIODO_CURTO[p]}
            </button>
          ))}
        </div>
        {recarregando && painel && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Atualizando" />
        )}
      </div>

      {painel ? (
        // Ao recarregar, mantém o quadro anterior esmaecido (sem piscar)
        <div className={cn("flex min-w-0 flex-col gap-4 transition-opacity", recarregando && "opacity-60")}>
          <Indicadores
            painel={painel}
            periodo={periodo}
            cameras={{ online: online.length, total: painel.por_camera.length }}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <LinhaDoTempo painel={painel} className="lg:col-span-3" />
            <PorClasse painel={painel} />
            <PorCamera painel={painel} status={cameras} agora={agora} className="lg:col-span-2" />
            <MapaDeCalor painel={painel} className="lg:col-span-2" />
            <Modelo versao={versaoModelo} />
            <Latencia painel={painel} className="lg:col-span-2" />
            <Confianca painel={painel} />
          </div>
        </div>
      ) : (
        !error && (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-accent-warm" />
            Carregando painel…
          </div>
        )
      )}

      {stats && (
        <section aria-label="Totais acumulados">
          <h2 className="mb-4 font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Totais acumulados
          </h2>
          <StatsBar total={stats.total} porClasse={stats.porClasse} />
        </section>
      )}

      <section aria-label="Detecções recentes">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Detecções · {ROTULO_PERIODO[periodo].toLowerCase()}
          </h2>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="filtro-classe">Classe</label>
            <select
              id="filtro-classe"
              className={selectCls}
              value={filtros.classe ?? ""}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, classe: (e.target.value || undefined) as ClasseNome | undefined }))
              }
            >
              <option value="">Todas as classes</option>
              {CLASSES.map(({ nome }) => (
                <option key={nome} value={nome}>{nome}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="filtro-camera">Câmera</label>
            <select
              id="filtro-camera"
              className={selectCls}
              value={filtros.camera_id ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, camera_id: e.target.value || undefined }))}
            >
              <option value="">Todas as câmeras</option>
              {painel?.por_camera.map((c) => (
                <option key={c.camera_id} value={c.camera_id}>
                  {c.camera_id} · {c.localizacao}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DetectionFeed
          items={items}
          hasMore={cursor !== null}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
        />
      </section>
    </div>
  );
}
