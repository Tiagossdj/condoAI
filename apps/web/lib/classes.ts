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
