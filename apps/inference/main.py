"""Loop principal do serviço de inferência: captura → YOLOv8 → MQTT (spec seções 2.1 e 4)."""

import argparse
import logging
import time
from datetime import datetime, timezone

import cv2

from config import CAMERA_ID, LOCALIZACAO

logger = logging.getLogger("inference")


def parse_source(source: str) -> int | str:
    # "0", "1"... são índices de câmera; qualquer outro valor é caminho de vídeo
    return int(source) if source.isdigit() else source


def run(source: int | str, detector, publisher, cooldown: float = 5.0) -> None:
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"não foi possível abrir a fonte de vídeo: {source}")

    # Momento (monotônico) da última publicação de cada classe (spec 4.4)
    ultima_publicacao: dict[str, float] = {}

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

            for deteccao in detector.predict(frame):
                classe = deteccao["classe"]
                agora = time.monotonic()
                if agora - ultima_publicacao.get(classe, float("-inf")) < cooldown:
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
                    logger.info(
                        "publicado: %s %.3f (%d ms)",
                        classe,
                        payload["confianca"],
                        payload["latencia_ms"],
                    )
    finally:
        cap.release()


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
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s"
    )

    # Imports tardios: carregar torch/ultralytics é lento e não é preciso para --help
    from model import Detector
    from mqtt_client import MQTTPublisher

    detector = Detector()
    publisher = MQTTPublisher()
    try:
        run(parse_source(args.source), detector, publisher, args.cooldown)
    except KeyboardInterrupt:
        logger.info("interrompido pelo usuário")
    finally:
        publisher.close()


if __name__ == "__main__":
    main()
