"""Treino exploratório do YOLOv8 e avaliação no split de teste (spec seções 6.2–6.4)."""

import shutil
import sys
from pathlib import Path

import yaml
from ultralytics import YOLO

from config import BASE_DIR, CLASSES

DATA_YAML = BASE_DIR / "datasets" / "condoai" / "data.yaml"
MODELS_DIR = BASE_DIR / "models"
RUN_NAME = "exploratorio"
ARTEFATOS = ["results.png", "confusion_matrix_normalized.png", "results.csv"]


def main() -> None:
    # A ordem do data.yaml define os IDs; precisa ser idêntica a CLASSES (spec 3.2)
    names = yaml.safe_load(DATA_YAML.read_text(encoding="utf-8"))["names"]
    if list(names) != CLASSES:
        sys.exit(f"data.yaml fora da ordem da spec: {names} != {CLASSES}")

    # workers=2: no Windows cada worker é um processo; o padrão (8) esgota a RAM (8 GB)
    last = BASE_DIR / "runs" / "detect" / RUN_NAME / "weights" / "last.pt"
    if last.exists():
        model = YOLO(str(last))
        model.train(resume=True, workers=2)
    else:
        model = YOLO(str(BASE_DIR / "yolov8n.pt"))
        model.train(
            data=str(DATA_YAML),
            epochs=50,
            batch=8,
            device=0,
            imgsz=640,
            workers=2,
            project=str(BASE_DIR / "runs" / "detect"),
            name=RUN_NAME,
            exist_ok=True,
        )

    run_dir = Path(model.trainer.save_dir)
    MODELS_DIR.mkdir(exist_ok=True)
    shutil.copy2(run_dir / "weights" / "best.pt", MODELS_DIR / "best.pt")
    for nome in ARTEFATOS:
        shutil.copy2(run_dir / nome, MODELS_DIR / nome)

    # Avaliação final (H1) no split de teste, nunca visto no treino
    best = YOLO(str(MODELS_DIR / "best.pt"))
    m = best.val(data=str(DATA_YAML), split="test", batch=8, device=0, workers=2, plots=False)
    print(f"[teste] mAP@50={m.box.map50:.4f} mAP@50-95={m.box.map:.4f} "
          f"P={m.box.mp:.4f} R={m.box.mr:.4f}")
    for i, nome in enumerate(CLASSES):
        print(f"[teste] {nome}: AP@50={m.box.ap50[i]:.4f}")


if __name__ == "__main__":
    main()
