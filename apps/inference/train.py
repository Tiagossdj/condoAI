"""Treino do YOLOv8 e avaliação no split de teste (spec seções 6.2–6.4).

Cada versão do modelo fica isolada: treino em runs/detect/<versão>/ e
artefatos finais em models/<versão>/. Uso:

    python train.py --versao v2 --dataset condoai_v2 --epocas 50
"""

import argparse
import shutil
import sys
from pathlib import Path

import yaml
from ultralytics import YOLO

from config import BASE_DIR, CLASSES

ARTEFATOS = ["results.png", "confusion_matrix_normalized.png", "results.csv"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Treino do YOLOv8 do condoAI")
    parser.add_argument("--versao", required=True, help="nome da versão (ex.: v2)")
    parser.add_argument("--dataset", required=True, help="pasta em datasets/ (ex.: condoai_v2)")
    parser.add_argument("--epocas", type=int, default=50)
    parser.add_argument("--modelo", default="yolov8n.pt", help="pesos iniciais (padrão: yolov8n.pt)")
    args = parser.parse_args()

    data_yaml = BASE_DIR / "datasets" / args.dataset / "data.yaml"
    models_dir = BASE_DIR / "models" / args.versao
    run_dir = BASE_DIR / "runs" / "detect" / args.versao

    if (models_dir / "best.pt").exists():
        sys.exit(f"versão {args.versao} já treinada ({models_dir}); escolha outro nome")

    # A ordem do data.yaml define os IDs; precisa ser idêntica a CLASSES (spec 3.2)
    names = yaml.safe_load(data_yaml.read_text(encoding="utf-8"))["names"]
    if list(names) != CLASSES:
        sys.exit(f"data.yaml fora da ordem da spec: {names} != {CLASSES}")

    # workers=2: no Windows cada worker é um processo; o padrão (8) esgota a RAM (8 GB)
    last = run_dir / "weights" / "last.pt"
    if last.exists():
        print(f"retomando {args.versao} de {last}")
        model = YOLO(str(last))
        model.train(resume=True, workers=2)
    else:
        model = YOLO(str(BASE_DIR / args.modelo))
        model.train(
            data=str(data_yaml),
            epochs=args.epocas,
            batch=8,
            device=0,
            imgsz=640,
            workers=2,
            project=str(run_dir.parent),
            name=args.versao,
            exist_ok=True,
        )

    save_dir = Path(model.trainer.save_dir)
    models_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(save_dir / "weights" / "best.pt", models_dir / "best.pt")
    for nome in ARTEFATOS:
        shutil.copy2(save_dir / nome, models_dir / nome)

    # Avaliação final (H1) no split de teste, nunca visto no treino
    best = YOLO(str(models_dir / "best.pt"))
    m = best.val(data=str(data_yaml), split="test", batch=8, device=0, workers=2, plots=False)
    print(f"[teste] mAP@50={m.box.map50:.4f} mAP@50-95={m.box.map:.4f} "
          f"P={m.box.mp:.4f} R={m.box.mr:.4f}")
    for i, cls in enumerate(m.box.ap_class_index):
        print(f"[teste] {CLASSES[cls]}: AP@50={m.box.ap50[i]:.4f} "
              f"P={m.box.p[i]:.4f} R={m.box.r[i]:.4f}")


if __name__ == "__main__":
    main()
