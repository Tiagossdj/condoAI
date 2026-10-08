"""Configuração do serviço de inferência do condoAI (spec seções 3.2, 4 e 6.4)."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Versão do modelo em produção: pesos em models/<versão>/best.pt (spec 6.4)
MODEL_VERSION = os.environ.get("MODEL_VERSION", "v2")

# Variáveis de ambiente (com padrões para desenvolvimento local)
MODEL_PATH = os.environ.get(
    "MODEL_PATH", str(BASE_DIR / "models" / MODEL_VERSION / "best.pt")
)
MQTT_HOST = os.environ.get("MQTT_HOST", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
CAMERA_ID = os.environ.get("CAMERA_ID", "cam_test")
LOCALIZACAO = os.environ.get("LOCALIZACAO", "Ambiente de teste — desenvolvimento")

# Constantes fixas
MQTT_TOPIC = "condoai/deteccoes"
STATUS_TOPIC = f"condoai/status/{CAMERA_ID}"  # sinal de vida, um tópico por câmera (spec 4.7)
STATUS_INTERVALO_S = 10
MQTT_KEEPALIVE_S = 15  # broker publica o Last Will após 1,5 × keepalive sem contato
CONFIDENCE_THRESHOLD = 0.4

# A posição na lista é o ID da classe no data.yaml (0–3)
CLASSES = ["saco_lixo", "garrafa_pet", "papelao", "lixo_generico"]
