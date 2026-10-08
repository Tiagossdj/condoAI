"""Loop principal do serviço de inferência: captura → YOLOv8 → MQTT (spec seções 2.1, 4 e 4.6)."""

import argparse
import logging
import time
from datetime import datetime, timezone

import cv2

from config import CAMERA_ID, CLASSES, LOCALIZACAO, MODEL_VERSION

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


def parse_source(source: str) -> int | str:
    # "0", "1"... são índices de câmera; qualquer outro valor é caminho de vídeo
    return int(source) if source.isdigit() else source


def desenhar(frame, deteccoes: list[dict], fps: float, inferencia_ms: int) -> None:
    """Desenha bounding boxes e o painel de status no próprio frame (spec 4.6)."""
    for d in deteccoes:
        x1, y1, x2, y2 = (int(v) for v in d["bbox"])
        cor = CORES[d["classe"]]
        # Caixa grossa + "MQTT" logo após a classe ser publicada
        espessura = 4 if d["publicado"] else 2
        rotulo = f"{d['classe']} {d['confianca']:.2f}" + (" MQTT" if d["publicado"] else "")

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
    cooldown: float = 5.0,
    preview: bool = False,
    gravar: str | None = None,
) -> None:
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"não foi possível abrir a fonte de vídeo: {source}")

    # Momento (monotônico) da última publicação de cada classe (spec 4.4)
    ultima_publicacao: dict[str, float] = {}

    gravador = None
    if gravar:
        fps_fonte = cap.get(cv2.CAP_PROP_FPS) if isinstance(source, str) else None
        gravador = Gravador(gravar, fps_fonte or None)
    fps = 0.0
    t_anterior = time.perf_counter()

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

            for deteccao in deteccoes:
                classe = deteccao["classe"]
                agora = time.monotonic()
                desde = agora - ultima_publicacao.get(classe, float("-inf"))
                deteccao["publicado"] = desde < DESTAQUE_MQTT_S
                if desde < cooldown:
                    continue

                payload = {
                    "timestamp": timestamp,
                    "camera_id": CAMERA_ID,
                    "classe": classe,
                    "confianca": deteccao["confianca"],
                    "localizacao": LOCALIZACAO,
                    "latencia_ms": round((time.perf_counter() - t0) * 1000),
                }
                # O cooldown só começa se a publicação foi enviada; com o broker
                # fora, a próxima detecção após a reconexão ainda é publicada
                if publisher.publish(payload):
                    ultima_publicacao[classe] = agora
                    deteccao["publicado"] = True
                    logger.info(
                        "publicado: %s %.3f (%d ms)",
                        classe,
                        payload["confianca"],
                        payload["latencia_ms"],
                    )

            if not preview:
                continue

            # FPS do loop completo (captura + inferência + publicação), suavizado
            t_atual = time.perf_counter()
            instantaneo = 1 / max(t_atual - t_anterior, 1e-6)
            fps = instantaneo if fps == 0 else 0.9 * fps + 0.1 * instantaneo
            t_anterior = t_atual

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
        "--cooldown",
        type=float,
        default=5.0,
        help="segundos sem republicar a mesma classe (padrão: 5)",
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
            args.cooldown,
            preview=args.preview,
            gravar=args.gravar,
        )
    except KeyboardInterrupt:
        logger.info("interrompido pelo usuário")
    finally:
        publisher.close()


if __name__ == "__main__":
    main()
