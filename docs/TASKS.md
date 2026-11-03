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

- [x] **T06** — Implementar plugin WebSocket
  - Arquivo: `apps/backend/src/plugins/websocket.js`
  - Endpoint `ws://localhost:3001/ws`
  - Emite evento `deteccao` para todos os clientes conectados
  - **Commit:** `feat(backend): adicionar plugin WebSocket para broadcast de detecções`
  - **Evidência:** conectar `wscat -c ws://localhost:3001/ws` e receber mensagem de teste

- [x] **T07** — Implementar plugin MQTT (subscriber)
  - Arquivo: `apps/backend/src/plugins/mqtt.js`
  - Subscribe em `condoai/deteccoes`; valida payload com Zod (spec seção 2.5);
    ao receber: persiste no banco + broadcast WebSocket
  - **Commit:** `feat(mqtt): adicionar subscriber MQTT que persiste e retransmite via WebSocket`
  - **Evidência:** publicar mensagem de teste via `mosquitto_pub`; verificar linha no banco e mensagem no `wscat`

---

## Fase 2 — Serviço de inferência (Python)

> Dependência: T04 concluído (plugin de banco funcionando) e T01 concluído
> (broker Mosquitto rodando via Docker).

- [x] **T08** — Configurar ambiente Python e instalar dependências
  - `apps/inference/requirements.txt`: ultralytics 8.x, paho-mqtt 2.x, opencv-python
  - Verificar CUDA: `python -c "import torch; print(torch.cuda.is_available())"`
  - **Commit:** `chore(inference): criar requirements.txt e verificar ambiente CUDA`
  - **Evidência:** `torch.cuda.is_available()` retorna `True`

- [x] **T09** — Implementar `config.py`
  - Arquivo: `apps/inference/config.py`
  - Variáveis: `MODEL_PATH`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_TOPIC`, `CAMERA_ID`,
    `LOCALIZACAO`, `CONFIDENCE_THRESHOLD = 0.4`, `CLASSES = ['saco_lixo','garrafa_pet','papelao','lixo_generico']`
  - **Commit:** `feat(inference): adicionar config.py com variáveis de ambiente e constantes`

- [x] **T10** — Implementar `model.py` (wrapper YOLOv8)
  - Arquivo: `apps/inference/model.py`
  - Classe `Detector` com método `predict(frame) -> list[dict]`
  - Filtrar: só retornar detecções com `confianca >= CONFIDENCE_THRESHOLD`
  - Filtrar: só retornar classes no range 0–3 (LGPD)
  - **Commit:** `feat(inference): adicionar wrapper YOLOv8 com filtro de confiança e classes`
  - **Evidência:** `python -c "from model import Detector; d=Detector(); print('ok')"` sem erro

- [x] **T11** — Implementar `mqtt_client.py`
  - Arquivo: `apps/inference/mqtt_client.py`
  - Classe `MQTTPublisher` com método `publish(payload: dict)`
  - Reconexão automática após timeout
  - **Commit:** `feat(mqtt): adicionar publisher MQTT com reconexão automática`

- [x] **T12** — Implementar `main.py` (loop de captura)
  - Arquivo: `apps/inference/main.py`
  - Loop: captura frame → `Detector.predict()` → monta payload → `MQTTPublisher.publish()`
  - Medir `latencia_ms` desde captura até publicação
  - Aceitar arquivo de vídeo ou câmera (`--source 0` ou `--source video.mp4`)
  - **Commit:** `feat(inference): implementar loop principal de captura e inferência`
  - **Evidência:** rodar com vídeo de teste; payload aparece no broker (`mosquitto_sub -t condoai/deteccoes`)

---

## Fase 3 — Frontend (Next.js)

> Dependência: T06 e T07 concluídos (backend com WebSocket e MQTT funcionando).

- [x] **T13** — Inicializar projeto Next.js 15
  - `apps/web/` com App Router, TypeScript, Tailwind CSS
  - Definir variáveis CSS da paleta (spec seção 8.1) em `app/globals.css`
  - **Commit:** `chore(web): inicializar Next.js 15 com App Router e paleta condoAI`
  - **Evidência:** `npm run dev` serve em `localhost:3000` sem erro

- [x] **T14** — Implementar `lib/api.ts` e `lib/websocket.ts`
  - `api.ts`: funções fetch para `/deteccoes`, `/cameras`, `/classes`; respostas
    validadas em runtime com Zod (spec seção 2.5), schemas espelhando o backend
  - `websocket.ts`: hook `useWebSocket` que conecta em `ws://localhost:3001/ws`
    e retorna `{ lastMessage, connected }`
  - **Commit:** `feat(web): adicionar utilitários de API REST e hook WebSocket`

- [x] **T15** — Implementar Landing page (`/`)
  - Componentes: nome condoAI, descrição, origem (TCC UNIP 2026), funcionalidade, CTA "Testar agora"
  - Link do CTA aponta para `/scan`
  - Responsivo, mobile-first, paleta da spec
  - **Commit:** `feat(web): implementar landing page com CTA para scan`
  - **Evidência:** screenshot mobile e desktop; link "Testar agora" navega para `/scan`

- [x] **T17** — Implementar endpoint `POST /scan` no backend
  - Recebe frame (multipart), chama serviço de inferência, publica MQTT, retorna resultado
  - **Commit:** `feat(backend): adicionar endpoint POST /scan para captura via frontend`
  - **Evidência:** `curl -F "frame=@test.jpg" -F "camera_id=cam_test" localhost:3001/scan` retorna JSON com classe
  - Contrato: spec seções 4.5 (`POST /predict`, FastAPI na porta 8000) e 8.4
  - Executada antes da T16: a tela `/scan` depende deste endpoint

- [x] **T16** — Implementar `CameraView.tsx` e tela de captura (`/scan`)
  - Dependência: T17 concluída (endpoint `POST /scan`)
  - `CameraView.tsx`: acessa câmera via `navigator.mediaDevices.getUserMedia`
  - Botão "Capturar" → `canvas.toBlob()` → `POST /scan` no backend
  - Exibe `ResultCard` com resultado
  - **Commit:** `feat(web): implementar captura de câmera e envio para inferência`
  - **Evidência:** capturar frame no celular; `ResultCard` exibe classe e confiança

- [x] **T18** — Implementar Dashboard (`/dashboard`)
  - `StatsBar.tsx`: contagem por classe (atualiza via WebSocket)
  - `DetectionFeed.tsx`: lista rolável de detecções em tempo real
  - Conectar `useWebSocket`; atualizar lista ao receber evento `deteccao`
  - Buscar histórico inicial via `GET /deteccoes`
  - **Commit:** `feat(web): implementar dashboard em tempo real com WebSocket`
  - **Evidência:** gerar detecção via `/scan` ou `mosquitto_pub`; feed atualiza sem reload

---

## Fase 4 — Validação e TCC

> Dependência: todas as fases anteriores concluídas.

- [x] **T19** — Treinar modelo YOLOv8 (exploratório, 50 épocas)
  - YOLOv8n ou YOLOv8s, batch=8, device=0
  - Salvar `best.pt` em `apps/inference/models/`
  - Gerar: `results.png`, `confusion_matrix_normalized.png`, `results.csv`
  - **Commit:** `feat(inference): adicionar pesos treinados e artefatos de avaliação`
  - **Evidência:** mAP@50 registrado; comparar com benchmark Aguiar (65,9%)
  - **Resultado (YOLOv8n, split de teste):** mAP@50 = 47,3% · mAP@50-95 = 41,7% ·
    P = 55,3% · R = 47,0% — abaixo do benchmark (65,9%)
    - AP@50 por classe: saco_lixo 9,8% · garrafa_pet 48,2% · papelao 84,5% · lixo_generico 46,8%
    - `saco_lixo` tem só 167 anotações (vs. ~5000 das maiores) e puxa a média para baixo

- [x] **T20** — Medir latência do pipeline (validação H2)
  - Medir: captura → inferência → MQTT → backend → WebSocket
  - Registrar em tabela: mínimo, mediano, máximo, P95 (mínimo 30 amostras)
  - **Commit:** `docs(spec): registrar resultados de latência medidos`
  - **Evidência:** tabela de latências; verificar se mediana < 3s (H2)
  - **Resultado:** mediana 26,8 ms · P95 34,9 ms · máx 42,2 ms (50 amostras) — H2 confirmada; tabela na spec 1.5

- [x] **T21** — Teste de integração completo (smoke test)
  - Iniciar: Docker Compose (Postgres + Mosquitto) + backend + inference + web
  - Capturar via `/scan`; verificar: resultado na tela → linha no banco → feed no dashboard
  - **Commit:** `test(backend): smoke test de integração do pipeline completo`
  - **Evidência:** vídeo ou print screen do fluxo completo funcionando
  - **Resultado:** `npm run test:smoke` 2/2 (scan → WS → banco → GET /deteccoes); captura manual via webcam: 6 detecções de papelao (conf. 0,48–0,79) no ResultCard e no feed do dashboard sem reload

---

## Fase 5 — Aprimoramento do modelo

> Dependência: Fase 4 concluída. Cada versão do modelo fica em
> `apps/inference/models/<versão>/` com artefatos e `metricas.md` (spec 6.4).

- [x] **T22** — Treinar modelo v2 com dataset complementado (50 épocas)
  - Dataset `condoai_v2` (Roboflow `condoai-taco-trashnet-wasteinsight`): saco_lixo
    de 167 → 776 anotações; remapear classes para a ordem da spec 3.2
  - Mesma configuração do v1 (YOLOv8n, 50 épocas, batch=8): só o dataset muda,
    para isolar o efeito do volume de `saco_lixo` no resultado
  - `python train.py --versao v2 --dataset condoai_v2 --epocas 50`
  - Gerar `models/v2/metricas.md`; atualizar spec 6.1 com o dataset novo
  - **Commit:** `feat(inference): adicionar modelo v2 treinado com dataset complementado`
  - **Evidência:** tabela comparativa v1 × v2 no teste (geral e por classe);
    comparar com benchmark Aguiar (65,9%)
  - **Resultado:** mAP@50 v1 47,3% → v2 **67,7%** (H1 atingida); saco_lixo 9,8% → 93,0%;
    demais classes estáveis (±1 p.p.). Detalhes em `models/v2/metricas.md`

- [x] **T23** — Treinar modelo v3 (rodada final, 100 épocas)
  - Dependência: T22 concluída
  - Dataset `condoai_v2`, YOLOv8n, 100 épocas (spec 6.2, "Final")
  - `python train.py --versao v3 --dataset condoai_v2 --epocas 100`
  - **Commit:** `feat(inference): adicionar modelo v3 com 100 épocas`
  - **Evidência:** tabela comparativa v1 × v2 × v3 no teste
  - **Resultado:** mAP@50 no teste v1 48,7% → v2 **67,7%** → v3 66,6% (H1 mantida);
    validação satura entre as épocas 40 e 60. v2 segue em produção.
    Detalhes em `models/v3/metricas.md`

- [x] **T24** — Monitoramento contínuo com visualização das detecções
  - Dependência: T23 concluída (modelo com bounding boxes confiáveis)
  - Abordagem escolhida: janela local no `main.py` (`--preview`), com gravação
    opcional do vídeo anotado (`--gravar`) para demonstração (spec 4.6 e 5)
  - **Evidência:** vídeo com detecções e bounding boxes sobre o objeto
  - **Resultado:** vídeo de teste (20 imagens do split de teste, 30 s) gravado
    com caixas, rótulos e destaque `MQTT`; ~32 fps, inferência 15–27 ms;
    24 publicações → 24 linhas em `deteccoes` com o backend no ar

## Fase 6 — Monitoramento contínuo em campo

> Dependência: Fase 5 concluída. Objetivo: demonstrar a câmera fixa
> monitorando um local de forma contínua, sem superlotar o banco
> (spec 4.4, 4.7 e 11).

- [x] **T25** — Ocorrências por classe no `main.py` (substitui o cooldown)
  - Dependência: T24 concluída
  - Estado `ausente`/`presente` por classe; confirmação após ≥ 1 s contínuo
    (lacunas ≤ 0,5 s); uma publicação por ocorrência; encerramento após
    `--ausencia` s sem ver a classe (padrão 30); `--cooldown` removido (spec 4.4)
  - `--preview`: rótulo com tempo de presença (ex.: `saco_lixo 0.87 - 2m13s`) (spec 4.6)
  - Sem alteração de schema nem de payload
  - **Commit:** `feat(inference): registrar ocorrências por classe em vez de detecções periódicas`
  - **Evidência:** vídeo de teste com um objeto parado por > 1 min gera 1 linha
    em `deteccoes` (antes: 1 a cada 5 s); objeto que some > 30 s e volta gera 2;
    falso positivo de poucos frames não gera nenhuma
  - **Resultado:** lógica isolada (tempo simulado, 30 fps) 13/13 casos OK, incluindo
    lacunas < 0,5 s, broker fora e stream travado; vídeo de 130 s (papelão 70 s →
    vazio 40 s → papelão 20 s) com backend no ar gerou **2 linhas** em `deteccoes`
    (com o cooldown de 5 s seriam ~18); publicação 1 s após o objeto aparecer

- [x] **T26** — Sinal de vida da câmera no dashboard
  - Dependência: T25 concluída
  - `main.py`: publica `online` em `condoai/status/<camera_id>` a cada 10 s, `offline` ao
    encerrar; Last Will `offline`; retain; keepalive 15 s (spec 4.7)
  - Backend: subscribe em `condoai/status/+` com validação Zod; estado em memória;
    evento WebSocket `status` + snapshot na conexão (spec 7.2)
  - Web: componente `CameraStatus` no dashboard; offline após 30 s sem sinal (spec 8.2)
  - **Commit:** `feat(backend): repassar sinal de vida das câmeras ao dashboard`
    (um commit por escopo: `inference`, `backend`, `web`)
  - **Evidência:** dashboard mostra "monitorando" com o `main.py` rodando;
    "offline" ao fechar com `q`; "offline" ao matar o processo (Last Will)
  - **Resultado:** broker recebe `online` na conexão e a cada 10 s, `offline` no
    encerramento normal; processo morto à força → `offline` do Last Will publicado
    pelo broker em ~1 s (socket fechado pelo SO; em queda de rede, keepalive ~23 s);
    smoke test do backend 3/3 (broadcast, snapshot na conexão, payload inválido
    descartado); cliente WebSocket recebe snapshot + `online` + `offline` do `main.py`
    real; `tsc` e `eslint` sem erros no web

- [x] **T27** — Filtros de campo: área monitorada e confirmação por proporção
  - Dependência: T26 concluída
  - Motivo: vídeo de campo (8 s) com o v2 detectou o saco em 100% dos frames,
    mas uma tomada virou `papelao` (26% dos frames) e gerou uma ocorrência falsa
  - `Ocorrencias`: confirmação com ≥ 70% dos frames numa janela móvel de 1 s (spec 4.4)
  - `main.py`: `--area` (ponto de apoio dentro do retângulo), `--definir-area`;
    preview com a área e detecções fora dela marcadas (spec 4.6 e 4.8)
  - **Commit:** `feat(inference): filtrar detecções por área monitorada e proporção de frames`
  - **Evidência:** testes da lógica de ocorrências (incluindo 26% → nenhuma,
    100% e 75% → uma); vídeo de campo: 2 → 1 ocorrência só com a proporção;
    com a área no chão, a tomada aparece como `fora da area`
  - **Resultado:** lógica de ocorrências 17/17 casos OK (25% e 50% → nenhuma;
    75% e 100% → uma; ponto de apoio dentro/fora da área); vídeo de campo:
    2 → **1 ocorrência** (`saco_lixo`) só com a proporção; com `--area 0,0.55,1,1`
    a tomada sai como `papelao - fora da area` e o `main.py` gravou 1 linha
    em `deteccoes` (`saco_lixo` 0,881)

- [x] **T28** — Dashboard analítico
  - Dependência: T27 concluída
  - Backend: `GET /painel?periodo=24h|7d|30d` (spec 7.1), agregados no fuso
    `America/Sao_Paulo`; parâmetro `de` em `GET /deteccoes`
  - Web: Recharts via `chart` do shadcn; blocos `Indicadores`, `LinhaDoTempo`,
    `MapaDeCalor`, `PorClasse`, `PorCamera`, `Latencia`, `Confianca`, `Modelo`;
    seletor de período; filtros no feed; recarrega a cada evento `deteccao` (spec 8.2)
  - **Commits:** `chore(web): adicionar recharts via componente chart do shadcn`;
    `feat(backend): adicionar GET /painel com agregados do dashboard`;
    `feat(web): ampliar dashboard com indicadores, séries e distribuições`
  - **Evidência:** smoke test do `/painel` (totais iguais à contagem direta no
    banco; agrupamento por hora no fuso local); `tsc`, `eslint` e build do web;
    conferência visual no navegador
  - **Resultado:** smoke test do backend 4/4 (inclui `/painel` nos 3 períodos:
    totais iguais à contagem no banco, blocos somando o total do período, série
    alinhada à hora/dia local, `?de=` no `/deteccoes`, período inválido → 400);
    `tsc`, `eslint` e `next build` sem erros; capturas em 1280 px e 390 px sem
    rolagem horizontal. Paleta das classes validada (contraste e daltonismo) sobre
    a superfície dos cards. Faixas de latência passaram a ter largura crescente
    (spec 7.1): faixas de 10 ms geravam centenas de barras com as latências do `/scan`

- [x] **T29** — Demonstração em campo com câmera IP fixa
  - Dependência: T28 concluída
  - Dois locais, uma câmera cadastrada em `cameras` para cada: `cam_corredor_a`
    (local `corredor_A`) e `cam_entrada` (local `entrada_garagem`); `main.py`
    com o `CAMERA_ID` e a `LOCALIZACAO` do local da sessão (spec 11)
  - Antes da sessão: apagar as detecções de teste da `cam_test` (confirmação
    explícita na hora)
  - Validar stream do DroidCam no `--source` (`http://<ip>:4747/video`)
  - Definir a área monitorada com `--definir-area` no local (spec 4.8)
  - Rede: hotspot do celular; perfil Privado; regras de firewall para 3000/3001 (spec 11)
  - Sessão contínua com a câmera fixa na área monitorada e o dashboard aberto
    em outro aparelho
  - **Commit:** `docs(spec): registrar resultado da demonstração em campo`
  - **Evidência:** sessão de ≥ 1 h; ocorrências e estado da câmera no dashboard
    acessado por outro aparelho; contagem de linhas no banco compatível com os
    descartes encenados
  - **Resultado:** corredor (`cam_corredor_a`): sessão ao vivo com câmera IP
    (DroidCam), cerca de 21 min de detecções (12:16–12:37); 11 ocorrências
    (saco_lixo 4, garrafa_pet 3, lixo_generico 2, papelao 2), confiança média
    0,766, latência média 25 ms; dashboard acompanhado em outro aparelho pela
    LAN. Foram usados menos de 11 objetos: parte deles foi retirada e recolocada
    depois da janela de ausência (30 s), de propósito, para mostrar que a
    ocorrência se encerra e o mesmo objeto é registrado de novo (spec 4.4).
    Entrada da garagem (`cam_entrada`): sem um segundo aparelho para o hotspot,
    o DroidCam não funcionou com o iPhone sendo o próprio roteador; o local foi
    gravado (8 min 29 s, 1024×576, 30 fps) e o vídeo processado depois pelo
    `main.py` (`--source <arquivo>`), pelo mesmo caminho MQTT → backend → banco
    → dashboard; 3 objetos encenados (papelão, garrafa, saco) → 3 ocorrências
    com as classes corretas, confiança 0,854–0,878. Desvios: duração total
    abaixo da 1 h prevista (limite de tempo no local); na garagem o timestamp é
    o do processamento, não o da gravação

## Fase 7 — Alerta escalonado ao gestor

> Dependência: Fase 6 concluída. Objetivo: fechar o ciclo detectar →
> avisar → agir → confirmar, avisando o gestor no celular quando um resíduo
> permanece em zona proibida (spec 2.1, 3.1, 4.4 e 7.3; RF11, RF13, RF14).
> Funcionalidade acrescentada após o TC1.

- [x] **T30** — Publicar o fim da ocorrência no `main.py`
  - Dependência: T29 concluída
  - No encerramento da ocorrência (`--ausencia`) e no encerramento normal do
    serviço, publicar em `condoai/ocorrencias/fim` com o `timestamp` da última
    vez em que a classe foi vista (spec 4.4)
  - Sem alteração no payload 4.2 nem no `/scan`
  - **Commit:** `feat(inference): publicar fim das ocorrências`
  - **Evidência:** testes da lógica de ocorrências (tempo simulado) com o fim
    publicado uma vez por ocorrência e com o `timestamp` da última aparição;
    vídeo com objeto que entra e sai gera início e fim no broker
  - **Resultado:** lógica isolada (tempo simulado, 30 fps) 15/15 casos OK: fim único
    ~30 s após a última aparição e com o horário dela; candidata (25%) sem fim; stream
    travado > 30 s → fim da antiga + nova ocorrência; `encerrar_todas` só nas presentes;
    broker fora → fins pendentes reenviados na ordem com o timestamp original;
    regressão da proporção (50% → 0; 75% e 100% → 1). Vídeo de campo (`corredor_a.mp4`,
    25 min) no Mosquitto real: 5 inícios e 5 fins, cada fim com `timestamp` ≥ início do
    par; trecho cortado com a garrafa ainda no quadro → fim publicado no encerramento,
    antes do `offline`

- [x] **T31** — Persistir fim e resolução das ocorrências
  - Dependência: T30 concluída
  - Migração: `tipo_area` em `cameras`; `fim`, `resolvido_em`,
    `alertas_enviados` e índice `idx_deteccoes_abertas` em `deteccoes`;
    seed da `cam_test` como `ponto_coleta` (spec 3.1 e 3.3)
  - Backend: subscribe em `condoai/ocorrencias/fim` com Zod; `fim` gravado na
    ocorrência aberta mais recente do par (câmera, classe) (spec 4.4);
    `POST /deteccoes/:id/resolver`; `fim` e `resolvido_em` em `GET /deteccoes`
    (spec 7.1)
  - **Commits:** `feat(db): adicionar fim, resolução e tipo de área às ocorrências`;
    `feat(backend): registrar fim das ocorrências e confirmação de resolução`
  - **Evidência:** linhas existentes preservadas após a migração; smoke test:
    fim gravado na ocorrência certa, fim sem ocorrência descartado com log,
    `/resolver` idempotente e `404` para id inexistente
  - **Resultado:** migração (`src/db/migracao_alerta.sql`, em transação) aplicada após
    backup com `pg_dump`: 14 linhas antes e depois (max id 171), todas com `fim` e
    `resolvido_em` nulos; `cam_test` → `ponto_coleta`, câmeras de campo → `zona_proibida`;
    segunda execução sem efeito; `schema.sql` num banco vazio chega ao mesmo estado
    (colunas, `deteccoes_fim_check`, `idx_deteccoes_abertas`). Smoke test 5/5 (4 antigos +
    1 novo): fim na linha certa; fim sem ocorrência descartado com log; com duas abertas do
    mesmo par, o fim vai para a mais recente; fim anterior ao início não é aplicado;
    `/resolver` 200 idempotente e 404; `GET /deteccoes/:id` com `fim` e `resolvido_em`;
    limpeza sem deixar linhas. `tsc` sem erros. POST com `Content-Type: application/json`
    e corpo vazio → 400 `FST_ERR_CTP_EMPTY_JSON_BODY` (verificar o botão do ntfy na T32)

- [x] **T32** — Agendador de alertas e servidor ntfy
  - Dependência: T31 concluída
  - `docker-compose.yml`: serviço `ntfy` na porta `8080` (spec 2.4)
  - Backend: agendador (spec 7.3) com limites e intervalo por variável de
    ambiente; mensagem sem imagem; prioridade crescente; botão "Resolvido"
  - **Commits:** `chore(backend): adicionar servidor ntfy ao docker-compose`;
    `feat(backend): alertar o gestor sobre resíduo parado em zona proibida`
  - **Evidência:** teste acelerado (`ALERTA_LIMITES_S=10,40,120`) com o
    celular Android recebendo os três alertas, sem repetir limite; "Resolvido"
    no alerta grava `resolvido_em` e interrompe os alertas; câmera
    `ponto_coleta` e câmera offline não geram alerta; Android sem internet
    recebe o alerta pela rede local
  - **Ajustes durante a tarefa** (aprovados): `online_desde` no sinal de vida (spec 4.7)
    e só ocorrências da sessão atual alertam (spec 7.3), porque as 7 ocorrências da
    demonstração de 9/10, sem fim, gerariam alertas falsos de 25 dias; `sequence_id` por
    ocorrência e confirmação "✔ … resolvida" no primeiro "Resolvido", porque no 1º teste
    com o celular o gestor clicou 10 vezes sem retorno e as notificações se acumulavam
  - **Resultado:** `test:alertas` 3/3 (limites 2, 4, 6 s): 3 alertas por ocorrência, um por
    limite, prioridades 3/4/5, sem anexo, mesmo `sequence_id`; botão "Resolvido" (mesma
    requisição do ntfy, clicado 2×) grava `resolvido_em`, publica 1 confirmação e
    interrompe os alertas; não alertam: encerrada, câmera offline, `ponto_coleta`, órfã
    com sucessora encerrada e ocorrência anterior à sessão. Smoke 5/5 com alertas
    desativados e ativados; `tsc` sem erros. Celular Android (dados móveis desligados,
    Wi-Fi local, limites 10, 40, 120 s, trecho do `corredor_a.mp4` como `cam_corredor_a`):
    1º teste: alertas de 10 s, 40 s e 2 min recebidos; "Resolvido" → 200 e `resolvido_em`;
    nenhum alerta falso das ocorrências de 9/10. 2º teste (id 212): alerta de 10 s →
    "Resolvido" 41 s após a detecção → notificação substituída por "✔ garrafa_pet em
    corredor_A resolvida às 01:54 (40 s após a detecção)"; alertas de 40 s e 2 min não
    enviados. Firewall: removidas as regras de bloqueio do `node.exe` e do Docker Desktop
    Backend, que barravam 3001 e 8080 mesmo com a regra de liberação (bloqueio prevalece).
    Limitação observada: o papelão (id 198) recebeu o alerta de 40 s depois de sair, pois o
    fim só chega após `--ausencia` (spec 7.3). Ocorrências dos testes mantidas no banco

- [ ] **T33** — Demonstração em campo do ciclo completo
  - Dependência: T32 concluída
  - Sessão com câmera fixa em zona proibida, gestor com Android e limites
    reais ou reduzidos (registrar quais)
  - **Commit:** `docs(spec): registrar resultado do alerta escalonado em campo`
  - **Evidência:** ocorrências com `fim` e `resolvido_em` no banco; tempo de
    permanência e tempo até a confirmação por ocorrência
