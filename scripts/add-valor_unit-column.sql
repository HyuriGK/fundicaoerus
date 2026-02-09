-- Migração: adicionar coluna valor_unit na tabela acabamento_externo_registros
-- Execute no seu banco Postgres (psql ou ferramenta equivalente)

BEGIN;

ALTER TABLE acabamento_externo_registros
    ADD COLUMN IF NOT EXISTS valor_unit numeric(12,2);

-- Popular valor_unit para registros existentes quando possível (valor / quant)
UPDATE acabamento_externo_registros
SET valor_unit = CASE WHEN quant IS NOT NULL AND quant > 0 THEN ROUND((valor::numeric / quant::numeric)::numeric, 2) ELSE NULL END
WHERE (valor_unit IS NULL);

COMMIT;

-- Observação: verifique permissões e faça backup antes de executar esta migração.
