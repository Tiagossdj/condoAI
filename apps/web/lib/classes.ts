import type { ClasseNome } from './api'

// As 4 classes fixas do modelo (spec 3.2), na ordem do data.yaml
export const CLASSES: { nome: ClasseNome; descricao: string }[] = [
  { nome: 'saco_lixo', descricao: 'Saco plástico de lixo' },
  { nome: 'garrafa_pet', descricao: 'Garrafa PET' },
  { nome: 'papelao', descricao: 'Caixas de papelão' },
  { nome: 'lixo_generico', descricao: 'Outros resíduos não classificados' },
]

export const DESCRICOES = Object.fromEntries(
  CLASSES.map(({ nome, descricao }) => [nome, descricao]),
) as Record<ClasseNome, string>

// Cor de cada classe nos gráficos: paleta categórica validada (contraste,
// separação para daltonismo) sobre a superfície dos cards (#171a4a). A cor
// segue a classe, nunca a posição: filtrar não repinta as demais
export const CORES_CLASSE: Record<ClasseNome, string> = {
  saco_lixo: '#3987e5',
  garrafa_pet: '#d95926',
  papelao: '#199e70',
  lixo_generico: '#c98500',
}
