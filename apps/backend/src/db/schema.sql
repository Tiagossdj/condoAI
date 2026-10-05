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

-- Seed obrigatório
INSERT INTO classes (nome, descricao) VALUES
  ('saco_lixo',    'Saco plástico de lixo'),
  ('garrafa_pet',  'Garrafa PET'),
  ('papelao',      'Caixas de papelão'),
  ('lixo_generico','Outros resíduos não classificados');

INSERT INTO cameras (camera_id, localizacao) VALUES
  ('cam_test', 'Ambiente de teste — desenvolvimento');
