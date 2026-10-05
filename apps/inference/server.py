"""Modo HTTP do serviço de inferência: POST /predict (spec seção 4.5)."""

import threading
import time
from contextlib import asynccontextmanager
from typing import Annotated

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from model import Detector

INFERENCE_HOST = "127.0.0.1"
INFERENCE_PORT = 8000

state: dict = {}
# A GPU atende uma inferência por vez, mesmo com requisições simultâneas
predict_lock = threading.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Modelo carregado uma única vez e mantido em memória
    detector = Detector()
    # Aquecimento: a 1ª inferência inicializa o CUDA (~4 s) e distorceria a
    # latência da primeira requisição real (H2)
    detector.predict(np.zeros((640, 640, 3), dtype=np.uint8))
    state["detector"] = detector
    yield
    state.clear()


app = FastAPI(title="condoAI inference", lifespan=lifespan)


# Endpoint síncrono: o FastAPI o executa em threadpool, sem bloquear o loop
@app.post("/predict")
def predict(frame: Annotated[UploadFile, File()]):
    # O frame só existe em memória durante a requisição; nunca é salvo (spec 5)
    data = np.frombuffer(frame.file.read(), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR) if data.size else None
    if image is None:
        return JSONResponse({"error": "imagem inválida"}, status_code=400)

    with predict_lock:
        t0 = time.perf_counter()
        deteccoes = state["detector"].predict(image)
        inferencia_ms = round((time.perf_counter() - t0) * 1000)

    return {"deteccoes": deteccoes, "inferencia_ms": inferencia_ms}


if __name__ == "__main__":
    uvicorn.run(app, host=INFERENCE_HOST, port=INFERENCE_PORT)
