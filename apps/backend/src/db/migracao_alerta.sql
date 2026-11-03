-- Migração do alerta escalonado ao gestor (spec 3.1, 3.3 e 7.3; tarefa T31).
-- Leva um banco criado pelo schema.sql anterior ao estado atual, preservando
-- as linhas já registradas. Idempotente: pode ser executada mais de uma vez.
--
--   docker compose exec -T postgres psql -U condoai -d condoai -v ON_ERROR_STOP=1 \
--     < apps/backend/src/db/migracao_alerta.sql

BEGIN;

ALTER TABLE cameras
  ADD COLUMN IF NOT EXISTS tipo_area VARCHAR(20) NOT NULL DEFAULT 'zona_proibida'
    CHECK (tipo_area IN ('zona_proibida', 'ponto_coleta'));

ALTER TABLE deteccoes
  ADD COLUMN IF NOT EXISTS fim              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolvido_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alertas_enviados SMALLINT NOT NULL DEFAULT 0;

-- O PostgreSQL 16 não aceita IF NOT EXISTS em ADD CONSTRAINT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deteccoes_fim_check' AND conrelid = 'deteccoes'::regclass
  ) THEN
    ALTER TABLE deteccoes
      ADD CONSTRAINT deteccoes_fim_check CHECK (fim IS NULL OR fim >= timestamp);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_deteccoes_abertas ON deteccoes (camera_id, classe_id)
  WHERE fim IS NULL AND resolvido_em IS NULL;

-- cam_test é a câmera do /scan: ponto de coleta, nunca gera alerta
UPDATE cameras SET tipo_area = 'ponto_coleta' WHERE camera_id = 'cam_test';

COMMIT;
