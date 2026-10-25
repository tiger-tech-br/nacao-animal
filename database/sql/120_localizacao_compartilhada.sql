-- Guarda somente o link fornecido voluntariamente para esta entrega.
CREATE TABLE IF NOT EXISTS entrega_localizacao_compartilhada (
    venda_id UUID PRIMARY KEY REFERENCES vendas(id) ON DELETE CASCADE,
    url TEXT NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2048),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expira_em TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    email_enviado_em TIMESTAMPTZ,
    email_reservado_em TIMESTAMPTZ,
    email_reservado_id UUID,
    CHECK (expira_em > atualizado_em AND expira_em <= atualizado_em + INTERVAL '24 hours')
);

CREATE OR REPLACE FUNCTION encerrar_localizacao_compartilhada() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status <> 'SAIU_PARA_ENTREGA' THEN
        DELETE FROM entrega_localizacao_compartilhada WHERE venda_id=NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_encerrar_localizacao_compartilhada ON vendas;
CREATE TRIGGER trg_encerrar_localizacao_compartilhada AFTER UPDATE OF status ON vendas
FOR EACH ROW EXECUTE FUNCTION encerrar_localizacao_compartilhada();
