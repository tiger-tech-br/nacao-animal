-- Comprovante mínimo para repetir a confirmação após perda de conexão.
-- A validade nunca ultrapassa a do link privado usado na entrega.
CREATE TABLE IF NOT EXISTS entrega_conclusoes (
    venda_id UUID PRIMARY KEY REFERENCES vendas(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    confirmado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expira_em TIMESTAMPTZ NOT NULL,
    email_enviado_em TIMESTAMPTZ,
    email_reservado_em TIMESTAMPTZ,
    email_reservado_id UUID,
    CHECK (expira_em > confirmado_em AND expira_em <= confirmado_em + INTERVAL '12 hours')
);
