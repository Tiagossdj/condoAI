# docs/spec.md — Especificação Técnica do condoAI

> Fonte da verdade do projeto. O código é derivado deste documento.
> Qualquer decisão técnica não coberta aqui deve ser discutida e
> registrada aqui antes de ser implementada.
>
> Projeto: condoAI — TCC UNIP Ciência da Computação (2026)

---

## 1. Contexto e Problema

### 1.1 Problema

O descarte de resíduos sólidos em áreas comuns de condomínios
residenciais é um problema recorrente de difícil monitoramento manual.
Câmeras de segurança já instaladas nos condomínios capturam os eventos,
mas exigem vigilância humana contínua para identificação das ocorrências.

### 1.2 Objetivo

Desenvolver e avaliar um sistema de detecção automática de descarte
de resíduos utilizando o modelo YOLOv8 integrado a uma
arquitetura IoT com broker MQTT e dashboard web em tempo real.

O objetivo não é afirmar que o sistema "resolve o problema" ou "reduz
custos" — o objetivo é **demonstrar viabilidade técnica** de um pipeline
de detecção visual integrado com IoT aplicado ao contexto condominial.

### 1.3 Lacuna acadêmica

Nenhum dos trabalhos analisados na revisão bibliográfica propôs sistema
integrado com arquitetura IoT aplicado especificamente ao contexto
condominial. Os benchmarks de referência são:

- **Aguiar (2024, UFC):** YOLOv8m, classe única, mAP@50 = 65,9%
- **Espinosa-Juárez et al. (2025):** YOLOv8l, 4 classes, mAP@50 = 72%

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
- Tracking por objeto (`model.track` do ultralytics, com ID por objeto):
  as ocorrências (4.4) são controladas por classe
- Duração das ocorrências no banco (início e fim persistidos); hoje a
  duração aparece só no `--preview` (4.6)
- Área monitorada por câmera persistida no cadastro da câmera (ex.: coluna
  em `cameras`), em vez do argumento `--area` (4.8): com várias câmeras,
  cada enquadramento define onde a detecção vale

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

### 4.1 Tópicos

| Tópico | Conteúdo | Publicado por |
|---|---|---|
| `condoai/deteccoes` | uma mensagem por ocorrência (4.2 e 4.4) | `main.py` e `POST /scan` (8.4) |
| `condoai/status/<camera_id>` | sinal de vida da câmera (4.7); um tópico por câmera | `main.py` e broker (Last Will) |

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

### 4.4 Ocorrência por classe

A câmera fixa vê o mesmo resíduo em todos os frames (~30 fps) enquanto
ele estiver no local. Publicar por frame, ou a cada N segundos, gravaria
centenas de linhas para um único descarte. O `main.py` registra
**ocorrências**: cada classe tem um estado `ausente` ou `presente`.

1. **Confirmação:** a classe precisa aparecer em **≥ 70% dos frames**
   de uma janela móvel de **1 s**; uma lacuna > 0,5 s sem vê-la reinicia
   a contagem. Falsos positivos intermitentes (ex.: uma tomada vista como
   `papelao` em 26% dos frames) não viram ocorrência
2. **Publicação:** na confirmação, a classe passa a `presente` e **uma**
   mensagem é publicada em `condoai/deteccoes` (payload 4.2), com a
   maior confiança vista até ali. É a única linha gravada no banco
3. **Permanência:** enquanto a classe continua sendo vista, nada é
   publicado
4. **Encerramento:** se a classe não é vista por `--ausencia` segundos
   (padrão 30 s, tolera alguém passando na frente), a ocorrência termina
   e a classe volta a `ausente`. Se reaparecer, é uma nova ocorrência

Se a publicação falhar (broker fora), a classe continua `ausente` e a
próxima detecção confirmada tenta de novo.

**Limitação:** o controle é por classe. Dois sacos de lixo ao mesmo tempo
formam uma única ocorrência de `saco_lixo` (tracking por objeto é
trabalho futuro, 2.3).

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

### 4.6 Visualização local (`--preview`) e gravação (`--gravar`)

Para demonstrar o modelo funcionando, `main.py` tem dois argumentos
opcionais. Sem eles o loop roda sem janela e sem custo extra.

```
python main.py --source 0 --preview                     # janela ao vivo
python main.py --source 0 --preview --gravar demo.mp4   # janela + vídeo anotado
```

- `--preview`: abre uma janela OpenCV com, por detecção, bounding box e
  rótulo `classe confiança` (uma cor por classe). Com a ocorrência
  confirmada (4.4), o rótulo mostra há quanto tempo a classe está
  presente (ex.: `saco_lixo 0.87 - 2m13s`); por 1 s após a publicação
  MQTT, a caixa fica grossa e o rótulo ganha o sufixo `MQTT`. O rodapé
  mostra versão do modelo, FPS do loop e tempo de inferência. Com
  `--area` (4.8), a área monitorada aparece como retângulo e as detecções
  fora dela ficam cinza, finas e com o rótulo `fora da area`. `q`, `ESC`
  ou fechar a janela encerra o serviço
- `--gravar <arquivo.mp4>`: salva o vídeo anotado (exige `--preview`).
  Com arquivo de vídeo como fonte, usa o FPS da fonte; com câmera, mede o
  FPS real do loop nos primeiros 30 frames, para o vídeo não sair acelerado
- A publicação MQTT é idêntica com ou sem preview
- Vídeos gravados ficam fora do git (`*.mp4` no `.gitignore`)

### 4.7 Sinal de vida da câmera (`condoai/status/<camera_id>`)

Sem detecções, o dashboard não teria como mostrar que a câmera está
monitorando. O `main.py` publica o estado da câmera em
`condoai/status/<camera_id>` (ex.: `condoai/status/cam_hall`):

```json
{
  "camera_id": "cam_hall",
  "timestamp": "2026-10-08T14:32:00.000Z",
  "estado": "online",
  "modelo": "v2",
  "fps": 31.6
}
```

- `estado: "online"` ao iniciar e a cada **10 s** enquanto o loop roda
- `estado: "offline"` ao encerrar normalmente (fim do vídeo, `q`, Ctrl+C)
- **Last Will:** ao conectar, o `main.py` registra no broker uma mensagem
  `offline` (com `fps: null`). Se o processo cair ou a rede cair, o
  próprio broker a publica quando o keepalive expira (15 s × 1,5)
- Mensagens com **retain**: o broker guarda o último estado de cada
  câmera, e quem assina o tópico recebe o estado atual de imediato
- **Um tópico por câmera:** o broker retém uma única mensagem por
  tópico; com um tópico compartilhado, só o status da última câmera a
  publicar ficaria retido. O backend assina `condoai/status/+` e descarta
  payloads cujo `camera_id` difere do sufixo do tópico
- Validação Zod no backend (2.5); payload inválido é descartado com log
- Não é persistido: o banco guarda ocorrências, não sinais de vida

### 4.8 Área monitorada (`--area`)

Uma câmera fixa enquadra mais do que o ponto de descarte (paredes,
tomadas, portas). Objetos fixos fora desse ponto podem gerar falsos
positivos permanentes. O `main.py` aceita uma área monitorada:

```
python main.py --source <fonte> --definir-area           # marca a área com o mouse e imprime o --area
python main.py --source <fonte> --area 0,0.45,1,1 --preview
```

- `--area x1,y1,x2,y2`: retângulo em coordenadas **relativas ao quadro**
  (0 a 1), independente da resolução. Sem o argumento, a área é o
  quadro inteiro
- Uma detecção vale se o seu **ponto de apoio** (centro da borda inferior
  da caixa, onde o objeto toca o chão) está dentro da área. Detecções
  fora dela são descartadas antes do controle de ocorrências (4.4)
- `--definir-area`: abre o primeiro frame da fonte, o usuário arrasta um
  retângulo e o programa imprime o `--area` correspondente e encerra
- Só no loop contínuo (`main.py`); o `POST /predict` (4.5) e o `/scan`
  (8.4) não usam área: a foto é de perto e não há cena fixa

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
- Nenhum frame capturado é salvo em disco, com uma exceção explícita:
  `--gravar` (4.6), desligado por padrão e usado só para demonstração.
  O vídeo contém os frames brutos da câmera, que podem incluir pessoas;
  gravar apenas em ambiente controlado, com ciência dos presentes, e
  descartar o arquivo após o uso. O `--preview` só exibe na tela local

---

## 6. Especificação do modelo YOLOv8

### 6.1 Dataset

Os datasets são montados no Roboflow com as classes remapeadas para as 4 da
seção 3.2. O export do Roboflow ordena as classes alfabeticamente; os IDs
dos labels precisam ser remapeados para a ordem da spec antes do treino.

| Versão | Projeto Roboflow | Origens | Imagens | saco_lixo |
|---|---|---|---|---|
| `condoai` (v1) | `condoai-taco-trashnet` | TACO + TrashNet | 6.797 | 167 anotações |
| `condoai_v2` (v2+) | `condoai-taco-trashnet-wasteinsight` | TACO + TrashNet + WasteInsight | 7.264 | 776 anotações |

**Split** (imagens de origem): 70% treino / 15% validação / 15% teste

**Pré-processamento** (Roboflow): auto-orient; resize 640×640 (stretch)

**Data augmentation** (Roboflow, só no treino, ×2 por imagem):
- flip horizontal (50%)
- rotação ±15°
- brilho ±15%
- blur gaussiano 0–1,5 px (só `condoai_v2`)
- mosaic (aplicado pelo ultralytics durante o treino)

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

**Resultado das rodadas** (YOLOv8n, `condoai_v2`, split de teste):

| Versão | Épocas | Melhor época | mAP@50 val | mAP@50 teste |
|---|---|---|---|---|
| v2 | 50 | 40 | 75,1% | **67,7%** |
| v3 | 100 | 64 | 75,8% | 66,6% |

A rodada final de 100 épocas não superou a de 50: a validação satura entre
as épocas 40 e 60, e o teste caiu 1,1 p.p. O modelo em produção continua
sendo o **v2**. Detalhes em `apps/inference/models/v3/metricas.md`.

### 6.3 Métricas de avaliação

| Métrica | Descrição | Meta (H1) |
|---|---|---|
| mAP@50 | mAP com IoU=0.50 | ≥ 65,9% |
| mAP@50-95 | mAP com IoU=0.50:0.95 | registrar |
| Precisão | TP / (TP + FP) | registrar |
| Recall | TP / (TP + FN) | registrar |
| Matriz de confusão | por classe | registrar |

### 6.4 Artefatos gerados pelo treino

Cada versão do modelo (`v1`, `v2`, ...) é treinada com
`python train.py --versao <versão> --dataset <pasta> --epocas <n>`. O
ultralytics gera os artefatos em `runs/detect/<versão>/`:

- `results.png` → curvas de loss e mAP por época
- `confusion_matrix_normalized.png` → matriz de confusão normalizada
- `results.csv` → métricas por época (usado para gráficos do TCC)
- `weights/best.pt` → pesos do melhor checkpoint (usar este)

Ao final, `train.py` copia esses quatro arquivos para
`apps/inference/models/<versão>/`. Cada versão guarda também um
`metricas.md` com dataset, hiperparâmetros e métricas no teste, para
comparação entre versões no TCC. `best.pt` fica no `.gitignore`; os demais
artefatos são versionados.

O serviço de inferência carrega `models/<MODEL_VERSION>/best.pt`
(`MODEL_VERSION` em `config.py`, sobrescrevível por variável de ambiente).

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
| GET | `/painel` | Agregados do dashboard analítico (abaixo) |
| POST | `/scan` | Captura via frontend (seção 8.4) |

**Query params de `/deteccoes`:**

```
?limite=50&cursor=<timestamp_ISO>&camera_id=cam_hall&classe=saco_lixo&de=<timestamp_ISO>
```

`de` (opcional): só detecções com `timestamp >= de` (filtro de período do
feed no dashboard).

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

**`GET /painel?periodo=24h|7d|30d`** (padrão `24h`): agregados do
dashboard analítico (8.2) numa única chamada. Agrupamentos por hora/dia
no fuso **`America/Sao_Paulo`**, para "hoje" e as horas baterem com o
relógio local.

```json
{
  "periodo": "24h",
  "de": "2026-10-07T18:00:00.000Z",
  "ate": "2026-10-08T18:00:00.000Z",
  "intervalo": "hora",
  "indicadores": {
    "total_periodo": 12,
    "hoje": 5,
    "ontem": 3,
    "total_geral": 40,
    "confianca_media": 0.78,
    "latencia_ms": { "p50": 14, "p95": 31, "max": 52 }
  },
  "serie": [
    { "inicio": "2026-10-08T17:00:00.000Z", "saco_lixo": 2, "garrafa_pet": 0, "papelao": 1, "lixo_generico": 0 }
  ],
  "heatmap_30d": [ { "dia_semana": 0, "hora": 21, "total": 4 } ],
  "por_classe": [ { "classe": "saco_lixo", "total": 7, "confianca_media": 0.81 } ],
  "por_camera": [
    { "camera_id": "cam_corredor_a", "localizacao": "corredor_A", "total": 9, "ultima": "2026-10-08T17:42:00.000Z" }
  ],
  "latencia_hist": [ { "de_ms": 10, "ate_ms": 20, "total": 3 }, { "de_ms": 3000, "ate_ms": null, "total": 0 } ],
  "confianca_hist": [
    { "faixa": "0.4-0.5", "saco_lixo": 1, "garrafa_pet": 0, "papelao": 2, "lixo_generico": 0 }
  ]
}
```

- `intervalo`: `hora` para `24h`, `dia` para `7d` e `30d`. `serie` traz
  todos os intervalos do período, inclusive os com zero
- `hoje` / `ontem`: dias de calendário no fuso local, independentes do
  período; `total_geral`: todas as detecções
- `latencia_ms`: percentis de `latencia_ms` (captura do frame →
  publicação MQTT, 4.2) no período; `null` sem detecções. **Não** é a
  latência total da H2 (1.5), que inclui backend e dashboard
- `heatmap_30d`: sempre os últimos 30 dias; `dia_semana` 0 = domingo;
  só células com total > 0
- `por_classe`: as 4 classes, na ordem da seção 3.2, inclusive com zero
- `por_camera`: câmeras ativas, inclusive sem detecções (`ultima: null`)
- `latencia_hist`: faixas de largura crescente (0, 10, 20, 50, 100, 200,
  500, 1000, 2000, 3000 ms; a última, `ate_ms: null`, é "≥ 3 s", acima da
  meta da H2): o `main.py` fica em dezenas de ms e o `/scan` (HTTP +
  inferência) em centenas, e faixas fixas de 10 ms gerariam centenas de
  barras. `confianca_hist`: faixas de 0,1 entre 0,4 (threshold, 4.3) e 1,0
- O estado online/offline das câmeras não vem daqui: vem dos eventos
  `status` do WebSocket (7.2)

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

**Evento `status`:** o backend também assina `condoai/status/+` (4.7),
mantém o último estado de cada câmera **só em memória** e repassa cada
mensagem aos clientes. Ao conectar, o cliente recebe um evento `status`
por câmera conhecida (o snapshot atual):

```json
{
  "event": "status",
  "data": {
    "camera_id": "cam_hall",
    "estado": "online",
    "modelo": "v2",
    "fps": 31.6,
    "ultimo_sinal": "2026-10-08T14:32:00.000Z",
    "idade_s": 3
  }
}
```

- `ultimo_sinal`: `timestamp` do payload 4.7
- `idade_s`: segundos desde que o backend recebeu a mensagem, calculado
  no envio; o cliente usa para não depender do relógio do dispositivo

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
- O que é: sistema de detecção de descarte em condomínios
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
- Seletor de período (24 h / 7 dias / 30 dias) aplicado aos blocos
  analíticos, alimentados por `GET /painel` (7.1); a cada evento
  `deteccao` o painel é recarregado (eventos próximos agrupados num único
  recarregamento)
- Blocos analíticos (gráficos com Recharts, via componente `chart` do
  shadcn):
  - `Indicadores`: ocorrências hoje (vs. ontem), no período e total;
    câmeras online (x de y, dos eventos `status`); latência mediana e p95;
    confiança média
  - `LinhaDoTempo`: ocorrências por hora (24 h) ou por dia (7/30 dias),
    empilhadas por classe
  - `MapaDeCalor`: dia da semana × hora, últimos 30 dias (horários críticos)
  - `PorClasse`: quantidade e percentual por classe
  - `PorCamera`: câmera, local, estado, ocorrências no período, última
    ocorrência
  - `Latencia`: distribuição de `latencia_ms` (captura → publicação) com a
    meta de 3 s como referência
  - `Confianca`: distribuição da confiança por classe
  - `Modelo`: versão em produção (do `status` da câmera) e mAP@50 no
    teste da versão (`models/<versão>/metricas.md`)
- `StatsBar`: contagem por classe — total inicial via `GET /estatisticas`,
  incrementado a cada evento `deteccao` do WebSocket
- `DetectionFeed`: lista de detecções com timestamp, câmera, classe, confiança
  — histórico inicial via `GET /deteccoes`, eventos novos no topo,
  deduplicados por `id`; filtros de classe, câmera e período
  (`classe`, `camera_id`, `de`)
- `CameraStatus`: um indicador por câmera, a partir dos eventos `status`
  (7.2): "cam_hall · monitorando · último sinal há 3 s" (atualizado a
  cada segundo no cliente). Mostra **offline** quando `estado` é
  `offline` ou quando passam **30 s** sem sinal

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
│   ├── ui/                    ← componentes base (button, card, badge, chart)
│   ├── camera/
│   │   ├── CameraView.tsx     ← acessa câmera via getUserMedia
│   │   └── ResultCard.tsx     ← exibe resultado da inferência
│   └── dashboard/
│       ├── DetectionFeed.tsx  ← lista tempo real via WebSocket
│       ├── StatsBar.tsx       ← contagem por classe
│       ├── CameraStatus.tsx   ← sinal de vida das câmeras (4.7)
│       ├── Indicadores.tsx    ← KPIs do período (GET /painel)
│       ├── LinhaDoTempo.tsx   ← série por hora/dia, empilhada por classe
│       ├── MapaDeCalor.tsx    ← dia da semana × hora (30 dias)
│       ├── PorClasse.tsx      ← quantidade e % por classe
│       ├── PorCamera.tsx      ← tabela por câmera/local
│       ├── Latencia.tsx       ← distribuição captura → publicação
│       ├── Confianca.tsx      ← distribuição da confiança por classe
│       ├── Modelo.tsx         ← versão e mAP@50 do modelo
│       ├── BarrasPorClasse.tsx ← colunas empilhadas por classe (linha do tempo, confiança)
│       └── Bloco.tsx          ← moldura comum dos blocos analíticos
├── lib/
│   ├── api.ts                 ← fetch para o backend REST
│   ├── classes.ts             ← classes e cores fixas por classe nos gráficos
│   ├── painel.ts              ← rótulos de período e formatação no fuso local
│   ├── modelo.ts              ← mAP@50 por versão (models/<versão>/metricas.md)
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
- O controle de ocorrências da seção 4.4 não se aplica: cada captura é
  um pedido explícito do usuário
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
| RF11 | Na câmera fixa, o sistema deve registrar ocorrências (uma por presença de classe), não frames |
| RF12 | O dashboard deve exibir o estado de cada câmera (monitorando / offline) |

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

---

## 11. Topologia da demonstração em campo

A demonstração reproduz uma câmera fixa de condomínio usando só a rede
local (RNF03): sem internet, sem deploy.

```
[Celular com DroidCam]  ──Wi-Fi──►  [Notebook: main.py + YOLOv8 (GPU),   ──Wi-Fi──►  [Outro aparelho:
 câmera IP fixa                       Mosquitto, Fastify, PostgreSQL]                  dashboard no navegador]
 http://<ip>:4747/video
```

- **Câmera:** celular fixo apontado para a área monitorada, com o app
  DroidCam transmitindo vídeo pela rede. O `main.py` lê o stream direto:
  `python main.py --source http://<ip-do-celular>:4747/video --preview`.
  A versão gratuita do DroidCam aceita um cliente por vez; o cliente do
  DroidCam no PC precisa estar fechado
- **Instalação:** a demonstração usa dois locais, cada um com sua
  câmera na tabela `cameras`: `cam_corredor_a` (local `corredor_A`) e
  `cam_entrada` (local `entrada_garagem`). Em cada local, rodar o
  `main.py` com `CAMERA_ID` e `LOCALIZACAO` correspondentes; com a câmera já fixada,
  marcar o ponto de descarte com `--definir-area` e iniciar o
  monitoramento com o `--area` impresso (4.8)
- **Nó de borda:** o notebook processa o vídeo localmente (edge
  computing). Na rede trafegam apenas eventos JSON (4.2 e 4.7); nenhuma
  imagem sai do nó de inferência (seção 5)
- **Dashboard:** aberto em outro aparelho pela LAN
  (`http://<ip-do-notebook>:3000/dashboard`), mostrando as ocorrências e
  o estado da câmera em tempo real
- **Rede sem Wi-Fi no local:** roteador (hotspot) de um celular; não
  precisa de dados móveis. Notebook, câmera e aparelho da banca entram
  na mesma rede
- **Câmera fora da rede:** se o celular da câmera não puder entrar no
  Wi-Fi (ex.: ele próprio é o hotspot, e o DroidCam exige Wi-Fi), gravar
  o local e processar o arquivo depois com `--source <arquivo>`; o
  caminho até o dashboard é o mesmo, mas o `timestamp` das detecções é o
  do processamento, não o da gravação
- **Firewall do Windows:** marcar a rede como **Privada** e liberar
  entrada TCP nas portas `3000` e `3001` só no perfil Privado (PowerShell
  como administrador). A porta `1883` só precisa ser liberada se o
  `main.py` rodar em outra máquina
- **Acesso externo** (fora da LAN) não faz parte da demonstração; se
  necessário, um túnel (ex.: Cloudflare Tunnel) expõe o dashboard sem
  deploy, mas exige internet no notebook
