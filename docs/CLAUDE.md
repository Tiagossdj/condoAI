# CLAUDE.md — condoAI

> Este arquivo é o contrato de comportamento para o Claude Code neste projeto.
> Leia-o inteiro antes de qualquer ação. A spec em `docs/spec.md` é a fonte
> da verdade. O código é derivado dela — nunca o contrário.

---

## Identidade do projeto

**condoAI** é um sistema de detecção automática de descarte irregular de
resíduos sólidos em áreas comuns de condomínios residenciais. Integra
YOLOv8 (inferência visual) com arquitetura IoT via MQTT e um dashboard web
em tempo real.

É também o TCC de graduação em Ciência da Computação (UNIP, conclusão
dez/2026). O código precisa estar rigorosamente alinhado ao documento
acadêmico — decisões de arquitetura, modelo de dados e nomenclatura de
classes são fixos e documentados. Não improvise variações.

---

## Regras de comportamento (não negociáveis)

### 1. Pergunte antes de executar

Antes de criar, editar ou deletar qualquer arquivo, descreva o que vai
fazer e aguarde confirmação explícita. Isso inclui instalar dependências,
criar pastas e modificar configurações.

**Formato obrigatório de proposta:**

```
Vou fazer:
- [ ] criar apps/backend/src/plugins/db.js com pool PostgreSQL
- [ ] adicionar `pg` na seção dependencies do package.json

Posso prosseguir?
```

### 2. Respeite a arquitetura da spec

A estrutura de pastas, as interfaces entre camadas e as decisões técnicas
estão definidas em `docs/spec.md`. Se precisar desviar por razão técnica
válida, explique o motivo e aguarde aprovação antes de agir.

### 3. Conventional Commits obrigatórios

Todo commit segue o padrão:

```
<tipo>(<escopo>): <descrição imperativa em português>

[corpo opcional — explique o PORQUÊ, não o quê]
```

**Tipos permitidos:**

| Tipo | Uso |
|---|---|
| `feat` | nova funcionalidade |
| `fix` | correção de bug |
| `refactor` | refatoração sem mudança de comportamento |
| `test` | adição ou ajuste de testes |
| `docs` | alteração em documentação |
| `chore` | tarefas de manutenção (deps, config) |
| `perf` | melhoria de performance |

**Escopos válidos:** `inference`, `backend`, `web`, `db`, `mqtt`, `spec`

**Exemplos corretos:**
```
feat(backend): adicionar rota GET /deteccoes com paginação

Necessário para o dashboard consumir histórico de detecções.
Retorna array paginado com cursor, ordenado por timestamp DESC.
```

```
fix(mqtt): reconectar ao broker após timeout de 30s
chore(backend): atualizar fastify para 5.x
docs(spec): ajustar modelo de dados após decisão de schema
```

> Não incluir linha "Co-Authored-By" nos commits.

### 4. Uma tarefa por vez

Execute apenas a tarefa marcada como `[ ]` atual em `docs/tasks.md`.
Não antecipe tarefas seguintes. Não refatore código de outras camadas sem
que a tarefa indique. Marque a tarefa como `[x]` e mostre evidência de
funcionamento antes de propor a próxima.

### 5. Testes antes de marcar como concluído

Toda tarefa de implementação termina com teste manual descrito ou teste
automatizado. Não marque `[x]` sem evidência de que funciona.

### 6. Schema do banco é imutável sem aprovação explícita

`docs/spec.md` seção "Modelo de Dados" é o contrato do banco. Qualquer
alteração de schema (coluna, tipo, índice) requer aprovação explícita
antes de ser executada ou commitada.

### 7. Use Context7 para versões de bibliotecas

Antes de escrever código que usa Next.js App Router ou Fastify, consulte
o Context7 para garantir que a API usada é da versão correta. As versões
estão fixadas na seção "Versões" abaixo.

---

## Estrutura do repositório

```
condoai/
├── CLAUDE.md               ← você está aqui (leia antes de tudo)
├── apps/
│   ├── inference/          ← Python: YOLOv8 + MQTT publisher
│   ├── backend/            ← Node.js: Fastify + PostgreSQL + WebSocket
│   └── web/                ← Next.js: Landing + Scan + Dashboard
├── docs/
│   ├── spec.md             ← fonte da verdade técnica (leia depois deste)
│   └── tasks.md            ← tarefas sequenciais com dependências
└── .gitignore
```

Não crie pastas fora dessa estrutura sem aprovação.

---

## Versões fixas (não atualize sem aprovação)

| Tecnologia | Versão | Motivo |
|---|---|---|
| Python | 3.11 | compatibilidade CUDA 11.8 + YOLOv8 |
| ultralytics | 8.x | YOLOv8 — versão do TCC |
| Node.js | 20 LTS | versão estável atual |
| Fastify | 5.x | suporte a async nativo |
| Next.js | 15.x | App Router estável |
| PostgreSQL | 16.x | versão atual |
| paho-mqtt | 2.x | cliente MQTT Python |
| mqtt (npm) | 5.x | cliente MQTT Node.js |

---

## Portas e tópicos (não mude sem aprovação)

| Serviço | Porta / Endereço |
|---|---|
| Backend Fastify | `3001` |
| Frontend Next.js | `3000` |
| Broker MQTT Mosquitto | `1883` |
| Tópico MQTT | `condoai/deteccoes` |

---

## Referências rápidas

- Spec completa → `docs/spec.md`
- Tarefas → `docs/tasks.md`
- Schema SQL → `apps/backend/src/db/schema.sql`
- Classes do modelo → `apps/inference/config.py`
- Payload MQTT → `docs/spec.md` seção "Protocolo MQTT"