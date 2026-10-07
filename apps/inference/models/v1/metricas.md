# Modelo v1 — treino exploratório (T19)

## Configuração

| Item | Valor |
|---|---|
| Data | 2026-10-07 |
| Modelo base | `yolov8n.pt` (ultralytics 8.4.173) |
| Hiperparâmetros | epochs=50, batch=8, imgsz=640, device=0, workers=2 (demais: padrão) |
| Hardware | GTX 1650 4 GB, CUDA 11.8, torch 2.7.1+cu118 |
| Dataset | Roboflow `condoai-taco-trashnet` v1 (TACO + TrashNet), CC BY 4.0 |
| Pré-processamento | auto-orient, resize 640×640 (stretch); augmentation ×2: flip H, rotação ±15°, brilho ±15% |
| Observação | treino interrompido 2× por falta de RAM e retomado de `last.pt` (épocas 8 e 21) |

## Distribuição de anotações

| Split | Imagens | saco_lixo | garrafa_pet | papelao | lixo_generico |
|---|---|---|---|---|---|
| train | 5598 | 142 | 4168 | 2090 | 4106 |
| valid | 600 | 13 | 351 | 217 | 362 |
| test | 599 | 12 | 403 | 235 | 500 |
| **total** | 6797 | **167** | 4922 | 2542 | 4968 |

## Métricas no split de teste (`best.pt`, época 46)

| Métrica | Valor |
|---|---|
| mAP@50 | **47,3%** (benchmark Aguiar: 65,9% — H1 não atingida) |
| mAP@50-95 | 41,7% |
| Precisão | 55,3% |
| Recall | 47,0% |

| Classe | AP@50 | Precisão | Recall |
|---|---|---|---|
| saco_lixo | 9,8% | 26,3% | 16,7% |
| garrafa_pet | 48,2% | 55,1% | 47,9% |
| papelao | 84,5% | 74,5% | 82,1% |
| lixo_generico | 46,8% | 65,1% | 41,4% |

Melhor mAP@50 na validação: 55,1% (época 46).

## Matriz de confusão (`confusion_matrix_normalized.png`, validação)

- `saco_lixo` real → 23% acerto; 31% vira `garrafa_pet`, 23% `papelao`, 15% `lixo_generico`
- `garrafa_pet` ↔ `lixo_generico` se confundem (26% e 22%)
- falsos positivos no fundo: 53% saem como `lixo_generico` e 34% como `garrafa_pet`

## Observações do teste em campo (T21)

- Webcam: só detectava `papelao` com o objeto seguro na mão, em primeiro plano
- Bounding boxes maiores que o objeto
- Hipótese: viés do TrashNet (objeto único, de perto, ocupando o quadro todo)
