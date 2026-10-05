"""Configuração do serviço de inferência do condoAI (spec seções 3.2, 4 e 6.4)."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Variáveis de ambiente (com padrões para desenvolvimento local)
MODEL_PATH = os.environ.get("MODEL_PATH", str(BASE_DIR / "models" / "best.pt"))
MQTT_HOST = os.environ.get("MQTT_HOST", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
CAMERA_ID = os.environ.get("CAMERA_ID", "cam_test")
LOCALIZACAO = os.environ.get("LOCALIZACAO", "Ambiente de teste — desenvolvimento")

# Constantes fixas
MQTT_TOPIC = "condoai/deteccoes"
CONFIDENCE_THRESHOLD = 0.4

# A posição na lista é o ID da classe no data.yaml (0–3)
CLASSES = ["saco_lixo", "garrafa_pet", "papelao", "lixo_generico"]
