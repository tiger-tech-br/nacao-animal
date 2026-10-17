/*
==========================================================
 PETFLOW
 Arquivo: 053_pagseguro_vendas.sql
 Descricao: Campos de integracao com PagSeguro/PagBank.
==========================================================
*/

ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS pagseguro_checkout_id VARCHAR(120);

ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS pagseguro_order_id VARCHAR(120);

ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS pagseguro_charge_id VARCHAR(120);

ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS pagseguro_status VARCHAR(80);

ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS pagseguro_checkout_url TEXT;

ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS pagseguro_qr_code TEXT;

ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS pagseguro_qr_code_text TEXT;

ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS pagseguro_response JSONB;

ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS pagamento_atualizado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vendas_pagseguro_checkout_id
ON vendas(pagseguro_checkout_id);

CREATE INDEX IF NOT EXISTS idx_vendas_pagseguro_order_id
ON vendas(pagseguro_order_id);

CREATE INDEX IF NOT EXISTS idx_vendas_pagseguro_charge_id
ON vendas(pagseguro_charge_id);

CREATE INDEX IF NOT EXISTS idx_vendas_pagseguro_status
ON vendas(pagseguro_status);
