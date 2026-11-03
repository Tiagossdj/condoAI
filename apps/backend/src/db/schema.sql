-- Câmeras registradas no sistema
CREATE TABLE cameras (
  id         SERIAL PRIMARY KEY,
  camera_id  VARCHAR(50) UNIQUE NOT NULL,  -- identificador lógico (ex: "cam_hall")
  localizacao TEXT NOT NULL,               -- string estática configurada (ex: "Hall de entrada")
  ativo      BOOLEAN DEFAULT TRUE,
  tipo_area  VARCHAR(20) NOT NULL DEFAULT 'zona_proibida'
             CHECK (tipo_area IN ('zona_proibida', 'ponto_coleta'))
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
  latencia_ms INTEGER,
  fim              TIMESTAMPTZ,                -- última vez em que a classe foi vista (spec 4.4)
  resolvido_em     TIMESTAMPTZ,                -- confirmação do gestor (spec 7.3)
  alertas_enviados SMALLINT NOT NULL DEFAULT 0, -- quantos limites de alerta já foram avisados
  CONSTRAINT deteccoes_fim_check CHECK (fim IS NULL OR fim >= timestamp)
);

-- Índices de performance
CREATE INDEX idx_deteccoes_timestamp  ON deteccoes (timestamp DESC);
CREATE INDEX idx_deteccoes_camera     ON deteccoes (camera_id);
CREATE INDEX idx_deteccoes_classe     ON deteccoes (classe_id);
CREATE INDEX idx_deteccoes_abertas    ON deteccoes (camera_id, classe_id)
  WHERE fim IS NULL AND resolvido_em IS NULL;

-- Seed obrigatório
INSERT INTO classes (nome, descricao) VALUES
  ('saco_lixo',    'Saco plástico de lixo'),
  ('garrafa_pet',  'Garrafa PET'),
  ('papelao',      'Caixas de papelão'),
  ('lixo_generico','Outros resíduos não classificados');

-- cam_test é a câmera do /scan: ponto de coleta, nunca gera alerta (spec 3.3)
INSERT INTO cameras (camera_id, localizacao, tipo_area) VALUES
  ('cam_test', 'Ambiente de teste — desenvolvimento', 'ponto_coleta');
