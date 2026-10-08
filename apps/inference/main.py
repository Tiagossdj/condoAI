"""Loop principal do serviço de inferência: captura → YOLOv8 → MQTT (spec seções 2.1, 4, 4.6 e 4.7)."""

import argparse
import logging
import time
from datetime import datetime, timezone

import cv2

from config import CAMERA_ID, CLASSES, LOCALIZACAO, MODEL_VERSION, STATUS_INTERVALO_S

logger = logging.getLogger("inference")

JANELA = "condoAI"
TECLAS_SAIR = {ord("q"), 27}  # q ou ESC

# Uma cor (BGR) por classe, na ordem de CLASSES
CORES = dict(
    zip(CLASSES, [(0, 200, 0), (255, 140, 0), (0, 165, 255), (180, 0, 200)])
)

# Tempo em que a caixa fica destacada após a publicação: 1 frame (~33 ms)
# passaria despercebido na janela
DESTAQUE_MQTT_S = 1.0

# Frames usados para medir o FPS real da câmera antes de abrir o vídeo (--gravar)
FRAMES_MEDICAO_FPS = 30

# Ocorrências (spec 4.4)
CONFIRMACAO_S = 1.0  # tempo contínuo vendo a classe até virar ocorrência
LACUNA_S = 0.5  # lacuna tolerada entre frames durante a confirmação


def parse_source(source: str) -> int | str:
    # "0", "1"... são índices de câmera; qualquer outro valor é caminho de vídeo
    return int(source) if source.isdigit() else source


def formatar_duracao(segundos: float) -> str:
    s = int(segundos)
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m{s % 60:02d}s"
    return f"{s // 3600}h{s % 3600 // 60:02d}m"


class Ocorrencias:
    """Estado ausente/presente por classe (spec 4.4).

    Cada classe passa por: candidata (vista há menos de CONFIRMACAO_S) →
    presente (confirmada e publicada uma única vez) → encerrada (não vista
    por `ausencia` segundos). Não depende de câmera nem de MQTT: o tempo
    entra como parâmetro, o que permite testar a lógica isoladamente.
    """

    def __init__(
        self,
        ausencia: float = 30.0,
        confirmacao: float = CONFIRMACAO_S,
        lacuna: float = LACUNA_S,
    ) -> None:
        self.ausencia = ausencia
        self.confirmacao = confirmacao
        self.lacuna = lacuna
        # classe → {"inicio", "ultimo", "confianca", "presente", "publicado_em"}
        self.estado: dict[str, dict] = {}

    def atualizar(self, deteccoes: list[dict], agora: float) -> list[str]:
        """Registra as detecções do frame; devolve as classes a publicar."""
        vistas: dict[str, float] = {}
        for d in deteccoes:
            vistas[d["classe"]] = max(vistas.get(d["classe"], 0.0), d["confianca"])

        for classe, confianca in vistas.items():
            e = self.estado.get(classe)
            # Candidata com lacuna longa recomeça a confirmação do zero; ocorrência
            # cuja ausência expirou sem frames no meio (ex.: stream travado) termina
            if e and agora - e["ultimo"] > (self.ausencia if e["presente"] else self.lacuna):
                self._encerrar(classe, e)
                e = None
            if e is None:
                self.estado[classe] = {
                    "inicio": agora,
                    "ultimo": agora,
                    "confianca": confianca,
                    "presente": False,
                    "publicado_em": None,
                }
            else:
                e["ultimo"] = agora
                e["confianca"] = max(e["confianca"], confianca)

        for classe, e in list(self.estado.items()):
            if classe in vistas:
                continue
            if agora - e["ultimo"] > (self.ausencia if e["presente"] else self.lacuna):
                self._encerrar(classe, e)

        return [
            classe
            for classe in vistas
            if not self.estado[classe]["presente"]
            and agora - self.estado[classe]["inicio"] >= self.confirmacao
        ]

    def _encerrar(self, classe: str, e: dict) -> None:
        if e["presente"]:
            logger.info(
                "ocorrência encerrada: %s, durou %s",
                classe,
                formatar_duracao(e["ultimo"] - e["inicio"]),
            )
        del self.estado[classe]

    def confianca(self, classe: str) -> float:
        return round(self.estado[classe]["confianca"], 3)

    def publicada(self, classe: str, agora: float) -> None:
        e = self.estado[classe]
        e["presente"] = True
        e["publicado_em"] = agora

    def presenca(self, classe: str, agora: float) -> float | None:
        """Segundos desde o início da ocorrência; None se não confirmada."""
        e = self.estado.get(classe)
        return agora - e["inicio"] if e and e["presente"] else None

    def em_destaque(self, classe: str, agora: float) -> bool:
        e = self.estado.get(classe)
        return bool(e and e["presente"] and agora - e["publicado_em"] < DESTAQUE_MQTT_S)


def desenhar(frame, deteccoes: list[dict], fps: float, inferencia_ms: int) -> None:
    """Desenha bounding boxes e o painel de status no próprio frame (spec 4.6)."""
    for d in deteccoes:
        x1, y1, x2, y2 = (int(v) for v in d["bbox"])
        cor = CORES[d["classe"]]
        # Caixa grossa + "MQTT" logo após a ocorrência ser publicada
        espessura = 4 if d["publicado"] else 2
        rotulo = f"{d['classe']} {d['confianca']:.2f}"
        if d["presenca_s"] is not None:
            # Hershey (cv2.putText) só desenha ASCII: separador "-" em vez de "·"
            rotulo += f" - {formatar_duracao(d['presenca_s'])}"
        if d["publicado"]:
            rotulo += " MQTT"

        cv2.rectangle(frame, (x1, y1), (x2, y2), cor, espessura)
        (lw, lh), base = cv2.getTextSize(rotulo, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        ty = max(y1, lh + base + 4)
        cv2.rectangle(frame, (x1, ty - lh - base - 4), (x1 + lw + 6, ty), cor, -1)
        cv2.putText(
            frame, rotulo, (x1 + 3, ty - base - 2),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA,
        )

    # Painel no rodapé: no topo cobriria o rótulo de caixas que tocam a borda
    status = f"modelo {MODEL_VERSION} | {fps:.1f} fps | inferencia {inferencia_ms} ms"
    h = frame.shape[0]
    cv2.rectangle(frame, (0, h - 28), (len(status) * 10 + 12, h), (0, 0, 0), -1)
    cv2.putText(
        frame, status, (6, h - 8),
        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA,
    )


class Gravador:
    """Grava o vídeo anotado (--gravar).

    Em arquivo de vídeo, usa o FPS da fonte. Em câmera, o FPS informado pelo
    driver não reflete a taxa real do loop (limitada pela inferência), então
    os primeiros frames ficam em buffer até o FPS real ser medido; sem isso o
    vídeo sairia acelerado.
    """

    def __init__(self, caminho: str, fps_fonte: float | None) -> None:
        self.caminho = caminho
        self.fps_fonte = fps_fonte
        self.writer: cv2.VideoWriter | None = None
        self.buffer: list = []
        self.inicio: float | None = None

    def _abrir(self, fps: float, frame) -> None:
        h, w = frame.shape[:2]
        self.writer = cv2.VideoWriter(
            self.caminho, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h)
        )
        if not self.writer.isOpened():
            raise RuntimeError(f"não foi possível gravar em: {self.caminho}")
        logger.info("gravando %s a %.1f fps", self.caminho, fps)

    def escrever(self, frame) -> None:
        if self.writer is None:
            if self.fps_fonte:
                self._abrir(self.fps_fonte, frame)
            else:
                # Mede a partir do 1º frame gravado: o aquecimento do modelo
                # (1ª inferência, mais lenta) fica fora da medição
                if self.inicio is None:
                    self.inicio = time.perf_counter()
                self.buffer.append(frame.copy())
                if len(self.buffer) < FRAMES_MEDICAO_FPS:
                    return
                self._descarregar()
                return
        self.writer.write(frame)

    def _descarregar(self) -> None:
        intervalo = time.perf_counter() - self.inicio
        fps = (len(self.buffer) - 1) / intervalo if intervalo > 0 else 0
        fps = fps if fps > 0 else 15.0  # vídeo de 1 frame
        self._abrir(fps, self.buffer[0])
        for f in self.buffer:
            self.writer.write(f)
        self.buffer.clear()

    def fechar(self) -> None:
        # Vídeo mais curto que a medição: grava o que houver
        if self.writer is None and self.buffer:
            self._descarregar()
        if self.writer is not None:
            self.writer.release()


def run(
    source: int | str,
    detector,
    publisher,
    ausencia: float = 30.0,
    preview: bool = False,
    gravar: str | None = None,
) -> None:
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"não foi possível abrir a fonte de vídeo: {source}")

    ocorrencias = Ocorrencias(ausencia)

    gravador = None
    if gravar:
        fps_fonte = cap.get(cv2.CAP_PROP_FPS) if isinstance(source, str) else None
        gravador = Gravador(gravar, fps_fonte or None)
    fps = 0.0
    t_anterior = time.perf_counter()
    primeiro_frame = True
    # Sinal de vida (spec 4.7) sai do próprio loop: se a captura travar, o
    # sinal para e o dashboard mostra a câmera offline
    ultimo_status = float("-inf")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                logger.info("fim da fonte de vídeo")
                break

            t0 = time.perf_counter()
            timestamp = (
                datetime.now(timezone.utc)
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z")
            )

            deteccoes = detector.predict(frame)
            inferencia_ms = round((time.perf_counter() - t0) * 1000)

            agora = time.monotonic()
            for classe in ocorrencias.atualizar(deteccoes, agora):
                payload = {
                    "timestamp": timestamp,
                    "camera_id": CAMERA_ID,
                    "classe": classe,
                    "confianca": ocorrencias.confianca(classe),
                    "localizacao": LOCALIZACAO,
                    "latencia_ms": round((time.perf_counter() - t0) * 1000),
                }
                # Só vira "presente" se a publicação foi enviada; com o broker
                # fora, a classe segue candidata e é publicada após a reconexão
                if publisher.publish(payload):
                    ocorrencias.publicada(classe, agora)
                    logger.info(
                        "ocorrência publicada: %s %.3f (%d ms)",
                        classe,
                        payload["confianca"],
                        payload["latencia_ms"],
                    )

            # FPS do loop completo (captura + inferência + publicação), suavizado
            # O 1º frame só marca o tempo: inclui o aquecimento do modelo
            t_atual = time.perf_counter()
            if primeiro_frame:
                primeiro_frame = False
            else:
                instantaneo = 1 / max(t_atual - t_anterior, 1e-6)
                fps = instantaneo if fps == 0 else 0.9 * fps + 0.1 * instantaneo
            t_anterior = t_atual

            if agora - ultimo_status >= STATUS_INTERVALO_S:
                publisher.publish_status("online", fps or None)
                ultimo_status = agora

            if not preview:
                continue

            for d in deteccoes:
                d["publicado"] = ocorrencias.em_destaque(d["classe"], agora)
                d["presenca_s"] = ocorrencias.presenca(d["classe"], agora)
            desenhar(frame, deteccoes, fps, inferencia_ms)
            if gravador:
                gravador.escrever(frame)
            cv2.imshow(JANELA, frame)

            # Sai com q/ESC ou ao fechar a janela no X
            if (cv2.waitKey(1) & 0xFF) in TECLAS_SAIR or (
                cv2.getWindowProperty(JANELA, cv2.WND_PROP_VISIBLE) < 1
            ):
                logger.info("preview fechado pelo usuário")
                break
    finally:
        cap.release()
        if gravador:
            gravador.fechar()
            logger.info("vídeo salvo em %s", gravar)
        if preview:
            cv2.destroyAllWindows()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serviço de inferência do condoAI")
    parser.add_argument(
        "--source", required=True, help="índice da câmera (ex.: 0) ou caminho de vídeo"
    )
    parser.add_argument(
        "--ausencia",
        type=float,
        default=30.0,
        help="segundos sem ver a classe até encerrar a ocorrência (padrão: 30)",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="abre uma janela com as detecções desenhadas (q/ESC para sair)",
    )
    parser.add_argument(
        "--gravar",
        metavar="ARQUIVO.mp4",
        help="salva o vídeo anotado (exige --preview; ver spec 5 sobre LGPD)",
    )
    args = parser.parse_args()
    if args.gravar and not args.preview:
        parser.error("--gravar exige --preview")

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s"
    )

    # Imports tardios: carregar torch/ultralytics é lento e não é preciso para --help
    from model import Detector
    from mqtt_client import MQTTPublisher

    detector = Detector()
    publisher = MQTTPublisher()
    try:
        run(
            parse_source(args.source),
            detector,
            publisher,
            args.ausencia,
            preview=args.preview,
            gravar=args.gravar,
        )
    except KeyboardInterrupt:
        logger.info("interrompido pelo usuário")
    finally:
        publisher.close()


if __name__ == "__main__":
    main()
