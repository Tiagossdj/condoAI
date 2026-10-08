# Modelo v3 — rodada final com 100 épocas (T23)

## Configuração

Idêntica ao v2 (`models/v2/metricas.md`); **só o número de épocas muda**
(50 → 100), para medir o efeito de um treino mais longo (spec 6.2, "Final").

| Item | Valor |
|---|---|
| Data | 2026-10-08 |
| Modelo base | `yolov8n.pt` (ultralytics 8.4.173) |
| Hiperparâmetros | epochs=100, batch=8, imgsz=640, device=0, workers=2 (demais: padrão) |
| Hardware | GTX 1650 4 GB, CUDA 11.8, torch 2.7.1+cu118 |
| Dataset | `condoai_v2` (mesmo do v2, mesma distribuição de anotações) |
| Duração | 5,2 h |
| Comando | `python train.py --versao v3 --dataset condoai_v2 --epocas 100` |

## Métricas no split de teste (`best.pt`, época 64)

Os três modelos avaliados no **mesmo** teste do `condoai_v2` (641 imagens).

| Métrica | v1 | v2 (50 ép.) | **v3 (100 ép.)** | Δ v3 − v2 |
|---|---|---|---|---|
| mAP@50 | 48,7% | **67,7%** | 66,6% | −1,1 p.p. |
| mAP@50-95 | 41,8% | **57,6%** | 55,8% | −1,8 p.p. |
| Precisão | 70,7% | 80,8% | **82,0%** | +1,2 p.p. |
| Recall | 42,7% | **60,2%** | 59,9% | −0,3 p.p. |

**H1 mantida:** mAP@50 = 66,6% ≥ 65,9% (benchmark Aguiar), com folga menor
que a do v2.

| Classe | AP@50 v1 | AP@50 v2 | **AP@50 v3** | AP@50-95 v3 | Precisão v3 | Recall v3 |
|---|---|---|---|---|---|---|
| saco_lixo | 27,0% | 93,0% | **93,9%** | 71,9% | 97,1% | 86,0% |
| garrafa_pet | 40,7% | 47,3% | **45,0%** | 36,0% | 65,3% | 39,8% |
| papelao | 82,7% | 83,7% | **82,5%** | 75,9% | 85,7% | 76,6% |
| lixo_generico | 44,3% | 46,8% | **44,9%** | 39,5% | 80,0% | 37,2% |

## Curva de validação

| Época | 10 | 20 | 30 | 40 | 50 | 60 | **64** | 70 | 80 | 90 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| mAP@50 (val) | 64,8% | 70,2% | 73,1% | 73,6% | 74,3% | 74,8% | **75,8%** | 74,8% | 75,2% | 75,3% | 75,0% |

Melhor mAP@50 na validação: 75,8% (época 64); no v2, 75,1% (época 40).

## Conclusão: efeito de treinar por mais épocas

- Com o mesmo dataset, dobrar as épocas **não melhorou o modelo**: na
  validação, +0,7 p.p.; no teste, −1,1 p.p. Diferenças de ~1 p.p. em 641
  imagens estão próximas do ruído.
- A curva de validação satura entre as épocas 40 e 60; as últimas 40 épocas
  oscilam em torno de 75%.
- O ganho na validação que não se repete no teste indica leve ajuste ao split
  de validação, usado para escolher o `best.pt`.
- O limite do YOLOv8n neste dataset é de **dados**, não de épocas:
  `garrafa_pet` e `lixo_generico` continuam em ~45%.
- **Decisão:** o v2 segue como modelo em produção (`MODEL_VERSION = "v2"` em
  `config.py`); o v3 fica registrado como rodada de comparação.

## Matriz de confusão (`confusion_matrix_normalized.png`, validação)

- `saco_lixo` real → 65% acerto (v2: 71%); erros espalhados entre `papelao` (12%) e `garrafa_pet` (11%)
- `garrafa_pet` real → 49% acerto; 23% vira `lixo_generico`
- `papelao` real → 73% acerto (v2: 59%)
- `lixo_generico` real → 52% acerto; 21% não é detectado (fundo) e 18% vira `garrafa_pet`
- falsos positivos no fundo: 54% saem como `lixo_generico` e 35% como `garrafa_pet`

## Ressalvas

- As mesmas do v2 (distribuição homogênea dos sacos de lixo; teste em campo
  é a validação definitiva).
- Seleção do `best.pt` pela validação: com mais épocas, há mais checkpoints
  candidatos e maior chance de escolher um pico ocasional da validação.
