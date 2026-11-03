"""Publisher MQTT do serviço de inferência (spec seções 4 e 4.7)."""

import json
import logging
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from config import (
    CAMERA_ID,
    FIM_TOPIC,
    MODEL_VERSION,
    MQTT_HOST,
    MQTT_KEEPALIVE_S,
    MQTT_PORT,
    MQTT_TOPIC,
    STATUS_TOPIC,
)

logger = logging.getLogger(__name__)


def _agora_iso() -> str:
    return (
        datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    )


def _status_payload(estado: str, fps: float | None, online_desde: str | None) -> str:
    return json.dumps(
        {
            "camera_id": CAMERA_ID,
            "timestamp": _agora_iso(),
            "estado": estado,
            "modelo": MODEL_VERSION,
            "fps": None if fps is None else round(fps, 1),
            # Início da sessão de monitoramento (spec 4.7): ocorrências anteriores
            # a ele não geram alerta, pois o main.py não as acompanha (spec 7.3)
            "online_desde": online_desde if estado == "online" else None,
        }
    )


class MQTTPublisher:
    def __init__(
        self, host: str = MQTT_HOST, port: int = MQTT_PORT, topic: str = MQTT_TOPIC
    ) -> None:
        self.topic = topic
        self.ultimo_fps: float | None = None
        # A sessão é o processo: a reconexão ao broker não a reinicia, porque o
        # estado das ocorrências continua em memória
        self.online_desde = _agora_iso()
        self.client = mqtt.Client(
            CallbackAPIVersion.VERSION2, client_id=f"condoai-inference-{CAMERA_ID}"
        )
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect

        # Last Will (spec 4.7): se o processo ou a rede caírem, o próprio broker
        # publica "offline". Precisa ser registrado antes de conectar; o
        # timestamp é o do momento da conexão (o broker não o atualiza)
        self.client.will_set(
            STATUS_TOPIC, _status_payload("offline", None, None), qos=1, retain=True
        )

        # Reconexão automática: espera de 1 s, dobrando até o teto de 30 s
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)

        # connect_async + loop_start: conecta em segundo plano, então o serviço
        # sobe mesmo com o broker fora do ar (RNF08)
        self.client.connect_async(host, port, keepalive=MQTT_KEEPALIVE_S)
        self.client.loop_start()

    def _on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        if reason_code.is_failure:
            logger.warning("falha ao conectar ao broker MQTT: %s", reason_code)
        else:
            logger.info("conectado ao broker MQTT")
            # Também na reconexão: o Last Will pode ter marcado "offline" na queda
            self.publish_status("online", self.ultimo_fps)

    def _on_disconnect(self, client, userdata, flags, reason_code, properties) -> None:
        if reason_code.is_failure:
            logger.warning("desconectado do broker MQTT (%s); reconectando", reason_code)
        else:
            logger.info("desconectado do broker MQTT")

    def publish(self, payload: dict) -> bool:
        # Detecções geradas com o broker fora são descartadas: reenviá-las
        # depois distorceria latencia_ms (medição da H2)
        if not self.client.is_connected():
            logger.warning("broker MQTT indisponível; detecção descartada")
            return False

        info = self.client.publish(
            self.topic, json.dumps(payload, ensure_ascii=False), qos=1
        )
        return info.rc == mqtt.MQTT_ERR_SUCCESS

    def publish_fim(self, payload: dict, aguardar: bool = False) -> bool:
        """Fim de ocorrência em condoai/ocorrencias/fim, sem retain (spec 4.4).

        Com o broker fora devolve False e o chamador guarda o fim para
        reenviar: o timestamp é o da última aparição, então o atraso não
        distorce a medida, e perder o fim deixaria a ocorrência aberta.
        """
        if not self.client.is_connected():
            return False
        info = self.client.publish(
            FIM_TOPIC, json.dumps(payload, ensure_ascii=False), qos=1
        )
        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            return False
        if aguardar:
            try:
                info.wait_for_publish(timeout=2)
            except (RuntimeError, ValueError):
                return False
            return info.is_published()
        return True

    def publish_status(self, estado: str, fps: float | None = None) -> bool:
        """Sinal de vida em condoai/status/<camera_id>, com retain (spec 4.7)."""
        if estado == "online":
            self.ultimo_fps = fps
        if not self.client.is_connected():
            return False
        info = self.client.publish(
            STATUS_TOPIC, _status_payload(estado, fps, self.online_desde), qos=1, retain=True
        )
        return info.rc == mqtt.MQTT_ERR_SUCCESS

    def close(self) -> None:
        # Encerramento normal: o Last Will não é enviado em disconnect(), então
        # o "offline" é publicado aqui e aguardado antes de desconectar
        if self.client.is_connected():
            info = self.client.publish(
                STATUS_TOPIC, _status_payload("offline", None, None), qos=1, retain=True
            )
            try:
                info.wait_for_publish(timeout=2)
            except (RuntimeError, ValueError):
                logger.warning("não foi possível publicar o status offline")
        self.client.disconnect()
        self.client.loop_stop()
