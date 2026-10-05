"""Wrapper do YOLOv8 com filtros de confiança e de classes (spec seções 4.3 e 5)."""

import logging

import torch
from ultralytics import YOLO

from config import CLASSES, CONFIDENCE_THRESHOLD, MODEL_PATH

logger = logging.getLogger(__name__)


class Detector:
    def __init__(self, model_path: str = MODEL_PATH) -> None:
        self.model = YOLO(model_path)
        self.device = 0 if torch.cuda.is_available() else "cpu"

        # Invariante LGPD: só são aceitos os índices 0–3 cujo nome no modelo
        # coincide com CLASSES[id]. Em um modelo pré-treinado (ex.: COCO, onde
        # o índice 0 é "person") nenhuma detecção passa.
        self.allowed_ids = {
            i for i, nome in enumerate(CLASSES) if self.model.names.get(i) == nome
        }
        if len(self.allowed_ids) != len(CLASSES):
            logger.warning(
                "classes do modelo não coincidem com CLASSES; ids aceitos: %s",
                sorted(self.allowed_ids),
            )

    def predict(self, frame) -> list[dict]:
        results = self.model.predict(
            frame, conf=CONFIDENCE_THRESHOLD, device=self.device, verbose=False
        )

        deteccoes = []
        for box in results[0].boxes:
            classe_id = int(box.cls)
            confianca = float(box.conf)
            if classe_id not in self.allowed_ids or confianca < CONFIDENCE_THRESHOLD:
                continue
            deteccoes.append(
                {
                    "classe": CLASSES[classe_id],
                    "confianca": round(confianca, 3),
                    "bbox": [round(v, 1) for v in box.xyxy[0].tolist()],
                }
            )
        return deteccoes
