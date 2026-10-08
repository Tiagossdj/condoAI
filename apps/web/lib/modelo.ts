// mAP@50 no split de teste de cada versão do modelo, copiado de
// apps/inference/models/<versão>/metricas.md (spec 6.3). Fixo: muda só com
// um novo treino
export const METRICAS_MODELO: Record<string, { map50: number; observacao: string }> = {
  v1: { map50: 0.473, observacao: 'dataset condoai (TACO + TrashNet), 50 épocas' },
  v2: { map50: 0.677, observacao: 'dataset condoai_v2 (+ WasteInsight), 50 épocas' },
  v3: { map50: 0.666, observacao: 'dataset condoai_v2, 100 épocas' },
}

// Benchmark da H1 (spec 1.4 e 6.3)
export const META_H1_MAP50 = 0.659

// Versão em produção (apps/inference/config.py), usada enquanto nenhuma
// câmera informou o modelo pelo sinal de vida (spec 4.7)
export const MODELO_PADRAO = 'v2'
