# Modelo v2 — dataset complementado com sacos de lixo (T22)

## Configuração

Idêntica ao v1 (`models/v1/metricas.md`); **só o dataset muda**, para isolar
o efeito do volume de anotações de `saco_lixo`.

| Item | Valor |
|---|---|
| Data | 2026-10-07 |
| Modelo base | `yolov8n.pt` (ultralytics 8.4.173) |
| Hiperparâmetros | epochs=50, batch=8, imgsz=640, device=0, workers=2 (demais: padrão) |
| Hardware | GTX 1650 4 GB, CUDA 11.8, torch 2.7.1+cu118 |
| Dataset | Roboflow `condoai-taco-trashnet-wasteinsight` v1 (TACO + TrashNet + WasteInsight), CC BY 4.0 |
| Pré-processamento | auto-orient, resize 640×640 (stretch); augmentation ×2 (só treino): flip H, rotação ±15°, brilho ±15%, blur gaussiano 0–1,5 px |
| Comando | `python train.py --versao v2 --dataset condoai_v2 --epocas 50` |

## Distribuição de anotações

| Split | Imagens | saco_lixo | garrafa_pet | papelao | lixo_generico |
|---|---|---|---|---|---|
| train | 5982 | 470 | 4295 | 2184 | 4208 |
| valid | 641 | 153 | 312 | 191 | 328 |
| test | 641 | 153 | 383 | 214 | 479 |
| **total** | 7264 | **776** (v1: 167) | 4990 | 2589 | 5015 |

Imagens de origem: 2991 / 641 / 641 = 70% / 15% / 15% (o treino dobra com o
augmentation). 20 imagens sem anotação (fundo).

## Métricas no split de teste (`best.pt`, época 40)

| Métrica | v1 | **v2** | Δ |
|---|---|---|---|
| mAP@50 | 47,3% | **67,7%** | +20,4 p.p. |
| mAP@50-95 | 41,7% | 57,6% | +15,9 p.p. |
| Precisão | 55,3% | 80,8% | +25,5 p.p. |
| Recall | 47,0% | 60,2% | +13,2 p.p. |

**H1 atingida:** mAP@50 = 67,7% ≥ 65,9% (benchmark Aguiar), dentro da faixa
esperada (65,9%–72%).

| Classe | AP@50 v1 | **AP@50 v2** | AP@50-95 v2 | Precisão v2 | Recall v2 |
|---|---|---|---|---|---|
| saco_lixo | 9,8% | **93,0%** | 72,5% | 90,8% | 83,5% |
| garrafa_pet | 48,2% | 47,3% | 38,6% | 65,2% | 42,8% |
| papelao | 84,5% | 83,7% | 78,9% | 83,1% | 79,0% |
| lixo_generico | 46,8% | 46,8% | 40,5% | 84,2% | 35,5% |

Melhor mAP@50 na validação: 75,1% (época 40).

### Comparação no mesmo conjunto de teste

v1 e v2 têm splits de teste diferentes. Avaliando o **v1 no teste do v2**:
mAP@50 = 48,7% (saco_lixo 27,0%, garrafa_pet 40,7%, papelao 82,7%,
lixo_generico 44,3%). O ganho do v2 se mantém: +19,0 p.p. no geral.

## Conclusão: efeito do volume de `saco_lixo`

- Com 4,6× mais anotações (167 → 776), o AP@50 de `saco_lixo` foi de 9,8% para
  93,0%, e o mAP@50 geral subiu 20,4 p.p. **somente pela mudança de dados**.
- As outras três classes ficaram praticamente iguais (variação ≤ 1 p.p.):
  o ganho geral vem quase todo de `saco_lixo`.
- No v1, a classe sub-representada derrubava a média, e a H1 não era atingida
  por causa dela.

## Matriz de confusão (`confusion_matrix_normalized.png`, validação)

- `saco_lixo` real → 71% acerto (v1: 23%); confusão com `garrafa_pet` caiu de 31% para 10%
- `garrafa_pet` ↔ `lixo_generico` continuam se confundindo (26% e 20%), como no v1
- `papelao` real → 59% acerto; 21% vira `lixo_generico`
- falsos positivos no fundo continuam: 48% saem como `lixo_generico` e 38% como `garrafa_pet`

## Ressalvas

- **Verificação de vazamento:** 107 imagens de teste têm nome de origem igual a
  imagens do treino (numeração genérica como `000000_jpg`), mas a comparação
  de conteúdo (correlação 16×16, com e sem flip) não encontrou nenhuma cópia.
- **Distribuição homogênea:** os sacos de lixo novos vêm, em sua maioria, de
  fotos do mesmo conjunto (`IMG-202403xx-WA`), presentes em treino e teste.
  O AP de 93% mede bem esse domínio, mas pode superestimar o desempenho em
  imagens do condomínio; o teste em campo (webcam) é a validação definitiva.
- **Classes fracas:** `garrafa_pet` e `lixo_generico` (~47%) são agora o gargalo;
  `lixo_generico` tem precisão alta (84%) e recall baixo (35%): o modelo deixa
  de detectar mais do que erra.
