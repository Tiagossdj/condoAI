"""Publisher MQTT do serviço de inferência (spec seção 4)."""

import json
import logging

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from config import CAMERA_ID, MQTT_HOST, MQTT_PORT, MQTT_TOPIC

logger = logging.getLogger(__name__)


class MQTTPublisher:
    def __init__(
        self, host: str = MQTT_HOST, port: int = MQTT_PORT, topic: str = MQTT_TOPIC
    ) -> None:
        self.topic = topic
        self.client = mqtt.Client(
            CallbackAPIVersion.VERSION2, client_id=f"condoai-inference-{CAMERA_ID}"
        )
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect

        # Reconexão automática: espera de 1 s, dobrando até o teto de 30 s
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)

        # connect_async + loop_start: conecta em segundo plano, então o serviço
        # sobe mesmo com o broker fora do ar (RNF08)
        self.client.connect_async(host, port)
        self.client.loop_start()

    def _on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        if reason_code.is_failure:
            logger.warning("falha ao conectar ao broker MQTT: %s", reason_code)
        else:
            logger.info("conectado ao broker MQTT")

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

    def close(self) -> None:
        self.client.disconnect()
        self.client.loop_stop()
