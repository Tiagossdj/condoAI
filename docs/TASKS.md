# docs/tasks.md — Tarefas do condoAI

> Metodologia: Spec-Driven Development
> Execute uma tarefa por vez. Marque `[x]` só após evidência de funcionamento.
> A spec em `docs/spec.md` é a referência para todas as tarefas.

---

## Fase 0 — Setup do repositório

- [x] **T00** — Inicializar repositório Git com `.gitignore` e estrutura de pastas
  - `condoai/apps/inference/`, `apps/backend/`, `apps/web/`, `docs/`
  - `.gitignore` cobre: `node_modules/`, `__pycache__/`, `*.pt`, `.env`, `runs/`
  - **Commit:** `chore(spec): inicializar estrutura do monorepo condoAI`
  - **Evidência:** `git log --oneline` mostra o commit; `ls apps/` lista as 3 pastas

- [x] **T01** — Criar `docker-compose.yml` com PostgreSQL e Mosquitto
  - Arquivo: `docker-compose.yml` na raiz do monorepo (spec seção 2.4)
  - Serviço `postgres`: imagem `postgres:16-alpine`, porta `5432`
  - Serviço `mosquitto`: imagem `eclipse-mosquitto:2`, portas `1883` e `9001`,
    com `mosquitto.conf` montado (a imagem não expõe porta sem config)
  - `.env.example` na raiz: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
  - **Commit:** `chore(spec): adicionar docker-compose com PostgreSQL e Mosquitto`
  - **Evidência:** `docker compose up -d` sobe os 2 containers; `docker compose ps`
    mostra ambos em execução

---

## Fase 1 — Backend + Banco de dados

> Dependência: T01 concluído (containers Docker rodando).

- [x] **T02** — Criar schema SQL e seed inicial
  - Arquivo: `apps/backend/src/db/schema.sql`
  - Tabelas: `cameras`, `classes`, `deteccoes` com índices (spec seção 3.1)
  - Seed: 4 classes + câmera `cam_test` (spec seção 3.3)
  - **Commit:** `feat(db): criar schema e seed inicial com 4 classes e câmera de teste`
  - **Evidência:** `docker compose exec postgres psql -U condoai -d condoai -c "\dt"`
    mostra as 3 tabelas; SELECT nas classes retorna 4 linhas

- [x] **T03** — Inicializar projeto Node.js e instalar dependências do backend
  - `apps/backend/package.json` com fastify 5.x, @fastify/websocket, pg, mqtt 5.x,
    zod 4.x, @fastify/type-provider-zod 1.x (spec seção 2.5)
  - `apps/backend/.env.example` com variáveis: `DATABASE_URL`, `MQTT_HOST`, `MQTT_PORT`, `PORT`
  - **Commit:** `chore(backend): inicializar projeto Node.js com dependências`
  - **Evidência:** `node -e "require('./src/server.js')"` não lança erro de import

- [x] **T04** — Implementar plugin de banco de dados (pool PostgreSQL)
  - Arquivo: `apps/backend/src/plugins/db.js`
  - Pool com `connectionString: process.env.DATABASE_URL`; expor `fastify.db`
    via `fastify-plugin`
  - **Commit:** `feat(db): adicionar plugin de pool PostgreSQL no backend`
  - **Evidência:** servidor inicia e conecta ao banco sem erro no log

- [x] **T05** — Implementar rotas REST (`/deteccoes`, `/cameras`, `/classes`, `/health`)
  - Arquivos: `apps/backend/src/routes/deteccoes.js`, `cameras.js`, `classes.js`
  - Schemas Zod em `apps/backend/src/schemas/index.ts` via `fastify-type-provider-zod`
    (spec seção 2.5)
  - GET `/health` retorna `{ status: "ok" }`
  - GET `/deteccoes` retorna array paginado (spec seção 7.1)
  - **Commit:** `feat(backend): adicionar rotas REST deteccoes, cameras, classes e health`
  - **Evidência:** `curl localhost:3001/health` retorna `{"status":"ok"}`; `curl localhost:3001/deteccoes` retorna `{"data":[],"next_cursor":null}`

- [ ] **T06** — Implementar plugin WebSocket
  - Arquivo: `apps/backend/src/plugins/websocket.js`
  - Endpoint `ws://localhost:3001/ws`
  - Emite evento `deteccao` para todos os clientes conectados
  - **Commit:** `feat(backend): adicionar plugin WebSocket para broadcast de detecções`
  - **Evidência:** conectar `wscat -c ws://localhost:3001/ws` e receber mensagem de teste

- [ ] **T07** — Implementar plugin MQTT (subscriber)
  - Arquivo: `apps/backend/src/plugins/mqtt.js`
  - Subscribe em `condoai/deteccoes`; valida payload com Zod (spec seção 2.5);
    ao receber: persiste no banco + broadcast WebSocket
  - **Commit:** `feat(mqtt): adicionar subscriber MQTT que persiste e retransmite via WebSocket`
  - **Evidência:** publicar mensagem de teste via `mosquitto_pub`; verificar linha no banco e mensagem no `wscat`

---

## Fase 2 — Serviço de inferência (Python)

> Dependência: T04 concluído (plugin de banco funcionando) e T01 concluído
> (broker Mosquitto rodando via Docker).

- [ ] **T08** — Configurar ambiente Python e instalar dependências
  - `apps/inference/requirements.txt`: ultralytics 8.x, paho-mqtt 2.x, opencv-python
  - Verificar CUDA: `python -c "import torch; print(torch.cuda.is_available())"`
  - **Commit:** `chore(inference): criar requirements.txt e verificar ambiente CUDA`
  - **Evidência:** `torch.cuda.is_available()` retorna `True`

- [ ] **T09** — Implementar `config.py`
  - Arquivo: `apps/inference/config.py`
  - Variáveis: `MODEL_PATH`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_TOPIC`, `CAMERA_ID`,
    `LOCALIZACAO`, `CONFIDENCE_THRESHOLD = 0.4`, `CLASSES = ['saco_lixo','garrafa_pet','papelao','lixo_generico']`
  - **Commit:** `feat(inference): adicionar config.py com variáveis de ambiente e constantes`

- [ ] **T10** — Implementar `model.py` (wrapper YOLOv8)
  - Arquivo: `apps/inference/model.py`
  - Classe `Detector` com método `predict(frame) -> list[dict]`
  - Filtrar: só retornar detecções com `confianca >= CONFIDENCE_THRESHOLD`
  - Filtrar: só retornar classes no range 0–3 (LGPD)
  - **Commit:** `feat(inference): adicionar wrapper YOLOv8 com filtro de confiança e classes`
  - **Evidência:** `python -c "from model import Detector; d=Detector(); print('ok')"` sem erro

- [ ] **T11** — Implementar `mqtt_client.py`
  - Arquivo: `apps/inference/mqtt_client.py`
  - Classe `MQTTPublisher` com método `publish(payload: dict)`
  - Reconexão automática após timeout
  - **Commit:** `feat(mqtt): adicionar publisher MQTT com reconexão automática`

- [ ] **T12** — Implementar `main.py` (loop de captura)
  - Arquivo: `apps/inference/main.py`
  - Loop: captura frame → `Detector.predict()` → monta payload → `MQTTPublisher.publish()`
  - Medir `latencia_ms` desde captura até publicação
  - Aceitar arquivo de vídeo ou câmera (`--source 0` ou `--source video.mp4`)
  - **Commit:** `feat(inference): implementar loop principal de captura e inferência`
  - **Evidência:** rodar com vídeo de teste; payload aparece no broker (`mosquitto_sub -t condoai/deteccoes`)

---

## Fase 3 — Frontend (Next.js)

> Dependência: T06 e T07 concluídos (backend com WebSocket e MQTT funcionando).

- [ ] **T13** — Inicializar projeto Next.js 15
  - `apps/web/` com App Router, TypeScript, Tailwind CSS
  - Definir variáveis CSS da paleta (spec seção 8.1) em `app/globals.css`
  - **Commit:** `chore(web): inicializar Next.js 15 com App Router e paleta condoAI`
  - **Evidência:** `npm run dev` serve em `localhost:3000` sem erro

- [ ] **T14** — Implementar `lib/api.ts` e `lib/websocket.ts`
  - `api.ts`: funções fetch para `/deteccoes`, `/cameras`, `/classes`; respostas
    validadas em runtime com Zod (spec seção 2.5), schemas espelhando o backend
  - `websocket.ts`: hook `useWebSocket` que conecta em `ws://localhost:3001/ws`
    e retorna `{ lastMessage, connected }`
  - **Commit:** `feat(web): adicionar utilitários de API REST e hook WebSocket`

- [ ] **T15** — Implementar Landing page (`/`)
  - Componentes: nome condoAI, descrição, origem (TCC UNIP 2026), funcionalidade, CTA "Testar agora"
  - Link do CTA aponta para `/scan`
  - Responsivo, mobile-first, paleta da spec
  - **Commit:** `feat(web): implementar landing page com CTA para scan`
  - **Evidência:** screenshot mobile e desktop; link "Testar agora" navega para `/scan`

- [ ] **T16** — Implementar `CameraView.tsx` e tela de captura (`/scan`)
  - `CameraView.tsx`: acessa câmera via `navigator.mediaDevices.getUserMedia`
  - Botão "Capturar" → `canvas.toBlob()` → `POST /scan` no backend
  - Exibe `ResultCard` com resultado
  - **Commit:** `feat(web): implementar captura de câmera e envio para inferência`
  - **Evidência:** capturar frame no celular; `ResultCard` exibe classe e confiança

- [ ] **T17** — Implementar endpoint `POST /scan` no backend
  - Recebe frame (multipart), chama serviço de inferência, publica MQTT, retorna resultado
  - **Commit:** `feat(backend): adicionar endpoint POST /scan para captura via frontend`
  - **Evidência:** `curl -F "frame=@test.jpg" -F "camera_id=cam_test" localhost:3001/scan` retorna JSON com classe

- [ ] **T18** — Implementar Dashboard (`/dashboard`)
  - `StatsBar.tsx`: contagem por classe (atualiza via WebSocket)
  - `DetectionFeed.tsx`: lista rolável de detecções em tempo real
  - Conectar `useWebSocket`; atualizar lista ao receber evento `deteccao`
  - Buscar histórico inicial via `GET /deteccoes`
  - **Commit:** `feat(web): implementar dashboard em tempo real com WebSocket`
  - **Evidência:** gerar detecção via `/scan` ou `mosquitto_pub`; feed atualiza sem reload

---

## Fase 4 — Validação e TCC

> Dependência: todas as fases anteriores concluídas.

- [ ] **T19** — Treinar modelo YOLOv8 (exploratório, 50 épocas)
  - YOLOv8n ou YOLOv8s, batch=8, device=0
  - Salvar `best.pt` em `apps/inference/models/`
  - Gerar: `results.png`, `confusion_matrix_normalized.png`, `results.csv`
  - **Commit:** `feat(inference): adicionar pesos treinados e artefatos de avaliação`
  - **Evidência:** mAP@50 registrado; comparar com benchmark Aguiar (65,9%)

- [ ] **T20** — Medir latência do pipeline (validação H2)
  - Medir: captura → inferência → MQTT → backend → WebSocket
  - Registrar em tabela: mínimo, mediano, máximo, P95 (mínimo 30 amostras)
  - **Commit:** `docs(spec): registrar resultados de latência medidos`
  - **Evidência:** tabela de latências; verificar se mediana < 3s (H2)

- [ ] **T21** — Teste de integração completo (smoke test)
  - Iniciar: Docker Compose (Postgres + Mosquitto) + backend + inference + web
  - Capturar via `/scan`; verificar: resultado na tela → linha no banco → feed no dashboard
  - **Commit:** `test(backend): smoke test de integração do pipeline completo`
  - **Evidência:** vídeo ou print screen do fluxo completo funcionando
