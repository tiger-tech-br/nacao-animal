/*
==========================================================
 PETFLOW
 Arquivo: 051_itens_venda.sql
 Descrição: Produtos vendidos em cada venda.
==========================================================
*/

CREATE TABLE IF NOT EXISTS itens_venda (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    venda_id UUID NOT NULL,

    produto_id UUID NOT NULL,

    quantidade INTEGER NOT NULL,

    preco_unitario NUMERIC(10,2) NOT NULL,

    desconto NUMERIC(10,2) NOT NULL DEFAULT 0,

    subtotal NUMERIC(10,2) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_itens_venda_venda
        FOREIGN KEY (venda_id)
        REFERENCES vendas(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_itens_venda_produto
        FOREIGN KEY (produto_id)
        REFERENCES produtos(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_itens_venda_quantidade
        CHECK (quantidade > 0),

    CONSTRAINT chk_itens_venda_preco
        CHECK (preco_unitario >= 0),

    CONSTRAINT chk_itens_venda_desconto
        CHECK (desconto >= 0),

    CONSTRAINT chk_itens_venda_subtotal
        CHECK (subtotal >= 0),

    CONSTRAINT chk_itens_venda_desconto_valido
        CHECK (
            desconto <= (quantidade * preco_unitario)
        )
);

/* ==========================================================
   ÍNDICES
========================================================== */

CREATE INDEX IF NOT EXISTS idx_itens_venda_venda
ON itens_venda(venda_id);

CREATE INDEX IF NOT EXISTS idx_itens_venda_produto
ON itens_venda(produto_id);

/* ==========================================================
   TRIGGER
========================================================== */

DROP TRIGGER IF EXISTS trg_itens_venda_updated_at ON itens_venda;
CREATE TRIGGER trg_itens_venda_updated_at BEFORE UPDATE ON itens_venda FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at();