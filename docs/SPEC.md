# docs/spec.md — Especificação Técnica do condoAI

> Fonte da verdade do projeto. O código é derivado deste documento.
> Qualquer decisão técnica não coberta aqui deve ser discutida e
> registrada aqui antes de ser implementada.
>
> Projeto: condoAI — TCC UNIP Ciência da Computação (2026)

---

## 1. Contexto e Problema

### 1.1 Problema

O descarte irregular de resíduos sólidos em áreas comuns de condomínios
residenciais é um problema recorrente de difícil monitoramento manual.
Câmeras de segurança já instaladas nos condomínios capturam os eventos,
mas exigem vigilância humana contínua para identificação das ocorrências.

### 1.2 Objetivo

Desenvolver e avaliar um sistema de detecção automática de descarte
irregular de resíduos utilizando o modelo YOLOv8 integrado a uma
arquitetura IoT com broker MQTT e dashboard web em tempo real.

O objetivo não é afirmar que o sistema "resolve o problema" ou "reduz
custos" — o objetivo é **demonstrar viabilidade técnica** de um pipeline
de detecção visual integrado com IoT aplicado ao contexto condominial.

### 1.3 Lacuna acadêmica

Nenhum dos trabalhos analisados na revisão bibliográfica propôs sistema
integrado com arquitetura IoT aplicado especificamente ao contexto
condominial. Os benchmarks de referência são:

- **Aguiar (2024, UFC):** YOLOv8m, classe única, mAP@50 = 65,9%
- **Bawankule et al. (2024):** YOLOv8l, 4 classes, mAP@50 = 72%

### 1.4 Hipóteses de pesquisa

- **H1:** O modelo treinado atingirá mAP@50 ≥ 65,9% (benchmark Aguiar),
  mesmo operando com 4 classes simultâneas — faixa esperada: 65,9%–72%.
- **H2:** A latência total do pipeline (captura → inferência → MQTT →
  backend) será inferior a 3 segundos em condições de execução local.
  Estimativa típica: ~233 ms em condições ideais; faixa realista: 86–495 ms.

### 1.5 Latência medida (validação da H2)

Medição em 2026-10-07 com `npm run latencia` (`apps/backend/scripts/latencia.ts`):
o cliente envia o frame via `POST /scan` e cronometra até receber o evento
`deteccao` no WebSocket, cobrindo inferência → MQTT → backend → Postgres →
WebSocket com um único relógio. 50 amostras sequenciais (+3 de aquecimento
descartadas), frame JPEG 640×640 (25,9 KB) do split de teste com detecção de
`papelao`, modelo YOLOv8n exploratório (T19).

**Ambiente:** Acer Nitro 5, GTX 1650 (CUDA 11.8), tudo local — Docker
(PostgreSQL 16 + Mosquitto), backend Fastify (build de produção) e
inferência FastAPI.

| Trecho (ms) | Mínimo | Mediana | Média | P95 | Máximo |
|---|---|---|---|---|---|
| Total: `/scan` → evento WebSocket | 24,1 | **26,8** | 27,9 | 34,9 | 42,2 |
| Backend: chegada → publicação MQTT (`latencia_ms`) | 20,0 | 22,0 | 23,1 | 28,0 | 31,0 |
| MQTT → Postgres → WebSocket (+ resposta HTTP) | 2,9 | 4,2 | 4,8 | 8,3 | 14,2 |

**Resultado:** mediana de 26,8 ms e máximo de 42,2 ms — H2 confirmada com
folga (meta < 3 s), abaixo até da faixa estimada (86–495 ms). O trecho
dominante é a inferência dentro do backend (~22 ms, incluindo a chamada
HTTP ao FastAPI); MQTT, persistência e broadcast somam ~4 ms.

**Limitações:** não inclui a captura no navegador (`getUserMedia` →
`canvas.toBlob`) nem a rede entre celular e servidor, pois tudo roda em
`localhost`; frames de câmera real tendem a ser maiores que 25,9 KB.

---

## 2. Arquitetura

### 2.1 Visão geral

O sistema é composto por **quatro camadas funcionais desacopladas**:

```
[Câmera / Smartphone]
        │ frames
        ▼
[Serviço de Inferência — Python/YOLOv8]
        │ payload JSON via MQTT
        ▼
[Broker MQTT — Mosquitto]  (tópico: condoai/deteccoes)
        │ subscribe
        ▼
[Backend — Node.js/Fastify]
        │ persiste no PostgreSQL
        │ broadcast via WebSocket
        ▼
[Dashboard — Next.js]  ← exibe em tempo real
```

O desacoplamento por MQTT é intencional: o serviço de inferência não
conhece o backend, e o backend não conhece a câmera. Cada camada pode
ser substituída ou escalada independentemente.

### 2.2 Justificativa das escolhas técnicas

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Python para inferência | Go, Node.js | ultralytics só suporta Python nativamente |
| Node.js + Fastify para backend | Go (Gin/Fiber) | grupo domina Python/JS; Go descartado |
| MQTT como protocolo | HTTP polling / WebSocket direto | desacoplamento real entre camadas; padrão IoT |
| PostgreSQL | MongoDB | dados relacionais com FK; integridade referencial necessária |
| Next.js App Router | CRA / Vite | SSR nativo; padrão atual do ecossistema React |
| Inferência centralizada | Edge (Jetson Nano / RPi + Coral) | hardware embarcado é trabalho futuro |

### 2.3 O que está fora do escopo (trabalho futuro)

- Deploy em nuvem (tudo roda em localhost/LAN)
- Escalabilidade multi-câmera simultânea
- Hardware embarcado / robô
- Autenticação de usuários
- Notificações push

---

### 2.4 Infraestrutura local (desenvolvimento)

PostgreSQL 16 e Mosquitto rodam via Docker Compose. O arquivo
`docker-compose.yml` fica na raiz do monorepo.

**Serviços:**

| Serviço | Imagem | Portas |
|---|---|---|
| postgres | `postgres:16-alpine` | `5432` |
| mosquitto | `eclipse-mosquitto:2` | `1883` (MQTT), `9001` (WebSocket) |

O Mosquitto requer um `mosquitto.conf` montado no container — a imagem
oficial não expõe nenhuma porta sem configuração explícita.

**Variáveis de ambiente (arquivo `.env` na raiz, nunca commitado):**

```env
POSTGRES_USER=condoai
POSTGRES_PASSWORD=<definir localmente>
POSTGRES_DB=condoai
```

> O backend **não** lê essas variáveis `POSTGRES_*` diretamente. Ele usa
> `DATABASE_URL` (string de conexão completa para node-postgres) no seu
> próprio `apps/backend/.env` — ver seção 2.5 e seção 7.

### 2.5 Validação de schema (Zod)

Zod 4.x é a camada de validação em todas as fronteiras do sistema.

**Backend (Fastify):**
- Integração via `fastify-type-provider-zod`
- Schemas Zod definidos junto às rotas em `apps/backend/src/routes/`
- Payload MQTT validado com Zod antes de persistir no banco
- Arquivo de schemas compartilhados: `apps/backend/src/schemas/index.ts`

**Frontend (Next.js):**
- Respostas da API validadas em runtime com Zod em `apps/web/lib/api.ts`
- Schemas de resposta espelham os schemas do backend

Versão fixada: zod 4.x, `@fastify/type-provider-zod` 1.x (exige
zod >=4.2.0 e fastify ^5.5.0 — única versão publicada no momento).

### 2.6 Linguagem e sistema de módulos

- **Linguagem:** TypeScript (strict mode) no backend (Node.js) e no
  frontend (Next.js). O serviço de inferência permanece em Python.
- **Sistema de módulos:** ESM (ESNext) — `import`/`export` em todo o
  código JavaScript/TypeScript. `require`/`module.exports` não são
  usados em nenhum lugar do projeto.
- **Extensão dos arquivos:** `.ts` no backend (`apps/backend/src/**/*.ts`),
  `.tsx` nos componentes React do frontend (`apps/web/**/*.tsx`).

Versão fixada: typescript 7.x no backend e 5.9.x no frontend (o Next.js 15
usa a API JS clássica do pacote `typescript` para checar tipos no build,
ausente no 7.x), tsx 4.x (execução direta em dev, sem
build), @types/node 24.x (alinhado ao Node.js 24 LTS).

---

## 3. Modelo de dados

### 3.1 Tabelas

```sql
-- Câmeras registradas no sistema
CREATE TABLE cameras (
  id         SERIAL PRIMARY KEY,
  camera_id  VARCHAR(50) UNIQUE NOT NULL,  -- identificador lógico (ex: "cam_hall")
  localizacao TEXT NOT NULL,               -- string estática configurada (ex: "Hall de entrada")
  ativo      BOOLEAN DEFAULT TRUE
);

-- Classes de objetos detectáveis
CREATE TABLE classes (
  id        SERIAL PRIMARY KEY,
  nome      VARCHAR(50) UNIQUE NOT NULL,   -- sem acento: saco_lixo, garrafa_pet, papelao, lixo_generico
  descricao TEXT
);

-- Detecções registradas
CREATE TABLE deteccoes (
  id          SERIAL PRIMARY KEY,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  camera_id   INTEGER NOT NULL REFERENCES cameras(id),
  classe_id   INTEGER NOT NULL REFERENCES classes(id),
  confianca   NUMERIC(4,3) CHECK (confianca >= 0 AND confianca <= 1),
  latencia_ms INTEGER
);

-- Índices de performance
CREATE INDEX idx_deteccoes_timestamp  ON deteccoes (timestamp DESC);
CREATE INDEX idx_deteccoes_camera     ON deteccoes (camera_id);
CREATE INDEX idx_deteccoes_classe     ON deteccoes (classe_id);
```

### 3.2 Classes do modelo YOLOv8

As 4 classes são fixas. Os nomes não têm acento e devem ser idênticos
no `data.yaml` do Roboflow, no `config.py` do serviço de inferência
e na tabela `classes` do banco.

| ID (ordem no data.yaml) | Nome | Descrição |
|---|---|---|
| 0 | `saco_lixo` | Saco plástico de lixo |
| 1 | `garrafa_pet` | Garrafa PET |
| 2 | `papelao` | Caixas de papelão |
| 3 | `lixo_generico` | Outros resíduos não classificados |

### 3.3 Seed obrigatório

Ao inicializar o banco, popular a tabela `classes` com as 4 classes acima
e a tabela `cameras` com ao menos uma câmera de teste:

```sql
INSERT INTO classes (nome, descricao) VALUES
  ('saco_lixo',    'Saco plástico de lixo'),
  ('garrafa_pet',  'Garrafa PET'),
  ('papelao',      'Caixas de papelão'),
  ('lixo_generico','Outros resíduos não classificados');

INSERT INTO cameras (camera_id, localizacao) VALUES
  ('cam_test', 'Ambiente de teste — desenvolvimento');
```

---

## 4. Protocolo MQTT

### 4.1 Tópico

```
condoai/deteccoes
```

### 4.2 Payload (JSON)

```json
{
  "timestamp":   "2026-10-05T14:32:00.000Z",
  "camera_id":   "cam_hall",
  "classe":      "saco_lixo",
  "confianca":   0.847,
  "localizacao": "Hall de entrada",
  "latencia_ms": 214
}
```

**Regras do payload:**

- `timestamp`: ISO 8601 UTC
- `camera_id`: string; deve existir na tabela `cameras`
- `classe`: deve ser um dos 4 nomes exatos da seção 3.2
- `confianca`: float entre 0 e 1, 3 casas decimais
- `localizacao`: string estática configurada em `config.py` (não é GPS)
- `latencia_ms`: inteiro; tempo desde captura do frame até publicação MQTT

### 4.3 Threshold de confiança

O serviço de inferência **não publica** detecções com `confianca < 0.4`.
Esse valor está em `config.py` como `CONFIDENCE_THRESHOLD = 0.4`.

### 4.4 Cooldown por classe

Para não publicar a mesma ocorrência a cada frame (~30 fps), o serviço
de inferência aplica um cooldown por classe: após publicar uma detecção
de uma classe, ignora novas detecções dessa mesma classe por N segundos.
Padrão: 5 s, ajustável pelo argumento `--cooldown` de `main.py`.

### 4.5 Serviço de inferência HTTP (`POST /predict`)

Além do loop contínuo (`main.py`, que publica no MQTT), o serviço de
inferência expõe um modo HTTP (`server.py`, FastAPI + uvicorn, porta
`8000`) usado pelo endpoint `POST /scan` do backend (seção 8.4). Os dois
modos coexistem e reutilizam o mesmo `Detector` de `model.py`.

O modelo é carregado **uma vez** na inicialização e mantido em memória;
chamar o `main.py` via subprocess recarregaria o modelo a cada requisição
(~2–5 s de overhead).

```
POST http://localhost:8000/predict      (INFERENCE_URL no backend)
Content-Type: multipart/form-data

frame: <imagem JPEG/PNG>
```

```json
{
  "deteccoes": [
    { "classe": "saco_lixo", "confianca": 0.847, "bbox": [48.6, 398.6, 245.3, 902.7] }
  ],
  "inferencia_ms": 41
}
```

- `deteccoes` já vem filtrada pelo threshold (4.3) e pelo filtro de
  classes por índice e nome (seção 5); lista vazia quando nada é detectado
- `bbox`: `[x1, y1, x2, y2]` em pixels da imagem recebida
- Imagem ilegível → `400 { "error": "imagem inválida" }`
- O frame existe apenas em memória durante a requisição; nunca é salvo

---

## 5. LGPD e privacidade

O modelo YOLOv8 é treinado **exclusivamente** nas 4 classes de resíduos.
A classe "pessoa" não existe no dataset. Nenhuma imagem de pessoa é
armazenada. O sistema não coleta, processa nem persiste dados pessoais.

Implementação:

- `data.yaml` tem exatamente 4 classes (0–3), sem classe de pessoa
- O serviço de inferência filtra no código: ignora qualquer detecção de
  classe fora do range 0–3 **ou** cujo nome no modelo (`model.names[id]`)
  difira de `CLASSES[id]` em `config.py` (defesa contra modelos
  pré-treinados — no COCO, por exemplo, o índice 0 é `person`, então o
  filtro só por índice não bastaria)
- Nenhum frame capturado é salvo em disco

---

## 6. Especificação do modelo YOLOv8

### 6.1 Dataset

| Dataset | Imagens | Fonte |
|---|---|---|
| TACO | ~1.500 | Roboflow |
| TrashBox | ~17.785 | Roboflow |

**Split:** 70% treino / 15% validação / 15% teste

**Data augmentation** (configurado no Roboflow):
- flip horizontal
- rotação ±15°
- brilho/contraste ±20%
- mosaic

### 6.2 Treinamento

```python
# Exploratório (primeira rodada)
model = YOLO('yolov8n.pt')  # ou yolov8s.pt
model.train(
    data='data.yaml',
    epochs=50,
    batch=8,
    device=0,        # CUDA (GTX 1650)
    imgsz=640
)

# Final (após ajuste de hiperparâmetros)
epochs=100
```

**Hardware:** Acer Nitro 5, GTX 1650, CUDA 11.8. YOLOv8m é mais lento
neste hardware — preferir n/s na fase exploratória.

### 6.3 Métricas de avaliação

| Métrica | Descrição | Meta (H1) |
|---|---|---|
| mAP@50 | mAP com IoU=0.50 | ≥ 65,9% |
| mAP@50-95 | mAP com IoU=0.50:0.95 | registrar |
| Precisão | TP / (TP + FP) | registrar |
| Recall | TP / (TP + FN) | registrar |
| Matriz de confusão | por classe | registrar |

### 6.4 Artefatos gerados pelo treino

Após `model.train()`, o ultralytics gera automaticamente em `runs/detect/train/`:

- `results.png` → curvas de loss e mAP por época
- `confusion_matrix_normalized.png` → matriz de confusão normalizada
- `results.csv` → métricas por época (usado para gráficos do TCC)
- `weights/best.pt` → pesos do melhor checkpoint (usar este)

`best.pt` vai para `apps/inference/models/best.pt` (no `.gitignore`).

---

## 7. APIs do backend

### 7.1 REST (Fastify, porta 3001)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/deteccoes` | Lista detecções (paginada, ordenada por timestamp DESC) |
| GET | `/deteccoes/:id` | Detecção específica |
| GET | `/cameras` | Lista câmeras ativas |
| GET | `/classes` | Lista classes disponíveis |
| GET | `/health` | Health check do serviço |
| GET | `/estatisticas` | Total de detecções e contagem por classe |
| POST | `/scan` | Captura via frontend (seção 8.4) |

**Query params de `/deteccoes`:**

```
?limite=50&cursor=<timestamp_ISO>&camera_id=cam_hall&classe=saco_lixo
```

**Resposta padrão de `/deteccoes`:**

```json
{
  "data": [
    {
      "id": 42,
      "timestamp": "2026-10-05T14:32:00.000Z",
      "camera": { "id": 1, "camera_id": "cam_hall", "localizacao": "Hall de entrada" },
      "classe": { "id": 1, "nome": "saco_lixo" },
      "confianca": 0.847,
      "latencia_ms": 214
    }
  ],
  "next_cursor": "2026-10-05T14:30:00.000Z"
}
```

**Resposta de `/estatisticas`:**

```json
{
  "total": 7,
  "ultimo_id": 42,
  "por_classe": [
    { "classe": "saco_lixo",     "total": 5 },
    { "classe": "garrafa_pet",   "total": 2 },
    { "classe": "papelao",       "total": 0 },
    { "classe": "lixo_generico", "total": 0 }
  ]
}
```

As 4 classes aparecem sempre (inclusive com total zero), na ordem da
seção 3.2. Usada pelo `StatsBar` do dashboard: a paginação de
`/deteccoes` não permite contar o total a partir do histórico carregado.
`ultimo_id` é o maior `id` contado (ou `null` sem detecções): o dashboard
só incrementa a contagem com eventos WebSocket de `id` maior, evitando
contar duas vezes uma detecção que chegou durante a requisição.

### 7.2 WebSocket (mesmo servidor, porta 3001)

**Endpoint:** `ws://localhost:3001/ws`

O backend faz subscribe no tópico MQTT `condoai/deteccoes`. A cada
mensagem recebida, persiste no banco e emite via WebSocket para todos
os clientes conectados.

**Formato da mensagem WebSocket (evento `deteccao`):**

```json
{
  "event": "deteccao",
  "data": {
    "id": 42,
    "timestamp": "2026-10-05T14:32:00.000Z",
    "camera_id": "cam_hall",
    "classe": "saco_lixo",
    "confianca": 0.847,
    "localizacao": "Hall de entrada",
    "latencia_ms": 214
  }
}
```

---

## 8. Frontend (Next.js 15, App Router)

### 8.1 Paleta de cores

```css
--color-bg-deep:    #000020;   /* fundo principal */
--color-bg-surface: #171a4a;   /* cards, nav */
--color-brand:      #2f2c79;   /* destaque (pode virar branco/off-white) */
--color-accent-warm:#e8c39e;   /* CTAs, destaques quentes */
--color-accent-light:#f5e1ce;  /* texto secundário, bordas suaves */
```

### 8.2 Telas

**Mobile-first.** Três telas principais:

#### Tela 1 — Landing page (`/`)

- Nome: condoAI
- O que é: sistema de detecção de descarte irregular em condomínios
- De onde surgiu: TCC UNIP Ciência da Computação 2026
- O que faz: detecta resíduos descartados incorretamente via visão computacional
- CTA: "Testar agora" → `/scan`
- Sistema aberto ao público para teste; sem autenticação

#### Tela 2 — Captura (`/scan`)

- Acessa câmera do dispositivo via `getUserMedia`
- Fallback: `getUserMedia` só existe em contexto seguro (HTTPS ou
  `localhost`). Acessando pela LAN via HTTP (ex.: celular em
  `http://192.168.x.x:3000`), a tela oferece
  `<input type="file" accept="image/*" capture="environment">`, que abre
  a câmera nativa do dispositivo; o restante do fluxo é idêntico
- Botão "Capturar" tira foto
- Frame é enviado via `POST /scan` ao backend (endpoint de upload)
- Backend passa o frame ao serviço de inferência
- Resultado retorna com classe, confiança e bounding box
- `ResultCard` exibe: classe detectada, confiança (%), timestamp;
  ou "nenhum resíduo detectado" quando `classe` é `null` (seção 8.4)

#### Tela 3 — Dashboard (`/dashboard`)

- Conecta via WebSocket em `ws://localhost:3001/ws`
- Exibe feed em tempo real de detecções
- `StatsBar`: contagem por classe — total inicial via `GET /estatisticas`,
  incrementado a cada evento `deteccao` do WebSocket
- `DetectionFeed`: lista de detecções com timestamp, câmera, classe, confiança
  — histórico inicial via `GET /deteccoes`, eventos novos no topo,
  deduplicados por `id`

### 8.3 Estrutura de pastas (Next.js)

```
apps/web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx               ← Landing
│   ├── scan/
│   │   └── page.tsx           ← Captura + resultado
│   └── dashboard/
│       └── page.tsx           ← Dashboard em tempo real
├── components/
│   ├── ui/                    ← componentes base (button, card, badge)
│   ├── camera/
│   │   ├── CameraView.tsx     ← acessa câmera via getUserMedia
│   │   └── ResultCard.tsx     ← exibe resultado da inferência
│   └── dashboard/
│       ├── DetectionFeed.tsx  ← lista tempo real via WebSocket
│       └── StatsBar.tsx       ← contagem por classe
├── lib/
│   ├── api.ts                 ← fetch para o backend REST
│   └── websocket.ts           ← hook useWebSocket
└── package.json
```

### 8.4 Endpoint de scan (integração câmera → inferência)

O frontend envia um `POST /scan` com o frame capturado:

```
POST http://localhost:3001/scan
Content-Type: multipart/form-data

frame: <arquivo de imagem>
camera_id: "cam_test"
```

O backend recebe o frame, repassa ao serviço de inferência via HTTP
(`POST /predict`, seção 4.5), fica com a detecção de **maior confiança**
(top-1) e retorna:

```json
{
  "classe": "saco_lixo",
  "confianca": 0.847,
  "bbox": [48.6, 398.6, 245.3, 902.7],
  "latencia_ms": 312,
  "timestamp": "2026-10-05T14:32:00.000Z"
}
```

**Regras:**

- Nenhuma detecção → `200` com `classe`, `confianca` e `bbox` iguais a
  `null`; nada é publicado
- Com detecção, o backend publica um payload no formato da seção 4.2 em
  `condoai/deteccoes`; o subscriber do próprio backend (seção 7.2)
  persiste e transmite ao dashboard — caminho único para toda detecção
- `timestamp`: momento em que a requisição chegou ao backend
- `latencia_ms`: tempo desde a chegada da requisição até a publicação
  MQTT (ou até a resposta, quando não há detecção)
- O cooldown da seção 4.4 não se aplica: cada captura é um pedido
  explícito do usuário
- `frame` ausente ou `camera_id` inexistente → `400 { "error": "..." }`
- Serviço de inferência indisponível → `502 { "error": "..." }`
- O frame não é salvo em disco em nenhuma das camadas (seção 5)

---

## 9. Requisitos funcionais

| ID | Requisito |
|---|---|
| RF01 | O sistema deve capturar frames de câmera fixa ou smartphone |
| RF02 | O sistema deve executar inferência YOLOv8 nos frames capturados |
| RF03 | O sistema deve classificar objetos em 4 classes: saco_lixo, garrafa_pet, papelao, lixo_generico |
| RF04 | O sistema deve publicar eventos de detecção no broker MQTT |
| RF05 | O sistema deve persistir detecções no banco PostgreSQL |
| RF06 | O sistema deve exibir detecções em tempo real via WebSocket no dashboard |
| RF07 | O sistema deve permitir captura via câmera do dispositivo móvel (tela /scan) |
| RF08 | O dashboard deve exibir contagem por classe de resíduo |
| RF09 | O sistema deve filtrar detecções com confiança < 0,4 |
| RF10 | O sistema não deve armazenar imagens de pessoas nem dados pessoais (LGPD) |

## 10. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF01 | Latência total do pipeline < 3 segundos (H2) |
| RNF02 | mAP@50 ≥ 65,9% no conjunto de teste (H1) |
| RNF03 | Sistema deve funcionar em ambiente local (localhost/LAN) sem dependência de nuvem |
| RNF04 | Frontend responsivo — mobile-first |
| RNF05 | Backend deve suportar múltiplos clientes WebSocket simultâneos |
| RNF06 | Modelo treinado exclusivamente nas 4 classes definidas (sem classe "pessoa") |
| RNF07 | Código versionado com Conventional Commits |
| RNF08 | Cada camada deve poder ser reiniciada independentemente das demais |