/*
==========================================================
 PETFLOW
 Arquivo: 022_movimentacoes_estoque.sql
 Descrição: Histórico de movimentações do estoque.
==========================================================
*/

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    produto_id UUID NOT NULL,

    tipo VARCHAR(20) NOT NULL
        CHECK (
            tipo IN (
                'ENTRADA',
                'SAIDA',
                'AJUSTE',
                'DEVOLUCAO',
                'PERDA'
            )
        ),

    quantidade INTEGER NOT NULL,

    observacao TEXT,

    usuario_id UUID,

    data_movimentacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_movimentacoes_produto
        FOREIGN KEY (produto_id)
        REFERENCES produtos(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_movimentacoes_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_movimentacao_quantidade
        CHECK (quantidade > 0),

    CONSTRAINT chk_movimentacao_observacao
        CHECK (
            observacao IS NULL
            OR LENGTH(TRIM(observacao)) > 0
        )
);

ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'AJUSTE';
ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS quantidade INTEGER NOT NULL DEFAULT 1;
ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS usuario_id UUID;
ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS data_movimentacao TIMESTAMPTZ NOT NULL DEFAULT NOW();

/* ==========================================================
   ÍNDICES
========================================================== */

CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto
ON movimentacoes_estoque(produto_id);

CREATE INDEX IF NOT EXISTS idx_movimentacoes_tipo
ON movimentacoes_estoque(tipo);

CREATE INDEX IF NOT EXISTS idx_movimentacoes_data
ON movimentacoes_estoque(data_movimentacao);

CREATE INDEX IF NOT EXISTS idx_movimentacoes_usuario
ON movimentacoes_estoque(usuario_id);

/* ==========================================================
   TRIGGER
========================================================== */

DROP TRIGGER IF EXISTS trg_movimentacoes_estoque_updated_at ON movimentacoes_estoque;
CREATE TRIGGER trg_movimentacoes_estoque_updated_at BEFORE UPDATE ON movimentacoes_estoque FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at();