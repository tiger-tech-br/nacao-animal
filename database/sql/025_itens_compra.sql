/*
==========================================================
 PETFLOW
 Arquivo: 025_itens_compra.sql
 Descrição: Produtos pertencentes a uma compra.
==========================================================
*/

CREATE TABLE IF NOT EXISTS itens_compra (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    compra_id UUID NOT NULL,

    produto_id UUID NOT NULL,

    quantidade INTEGER NOT NULL,

    preco_unitario NUMERIC(10,2) NOT NULL,

    desconto NUMERIC(10,2) NOT NULL DEFAULT 0,

    subtotal NUMERIC(10,2) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_itens_compra_compra
        FOREIGN KEY (compra_id)
        REFERENCES compras(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_itens_compra_produto
        FOREIGN KEY (produto_id)
        REFERENCES produtos(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_itens_compra_quantidade
        CHECK (quantidade > 0),

    CONSTRAINT chk_itens_compra_preco
        CHECK (preco_unitario >= 0),

    CONSTRAINT chk_itens_compra_desconto
        CHECK (desconto >= 0),

    CONSTRAINT chk_itens_compra_subtotal
        CHECK (subtotal >= 0),

    CONSTRAINT chk_itens_compra_desconto_valido
        CHECK (
            desconto <= (quantidade * preco_unitario)
        )
);

/* ==========================================================
   ÍNDICES
========================================================== */

CREATE INDEX IF NOT EXISTS idx_itens_compra_compra
ON itens_compra(compra_id);

CREATE INDEX IF NOT EXISTS idx_itens_compra_produto
ON itens_compra(produto_id);

/* ==========================================================
   TRIGGER
========================================================== */

DROP TRIGGER IF EXISTS trg_itens_compra_updated_at ON itens_compra;
CREATE TRIGGER trg_itens_compra_updated_at BEFORE UPDATE ON itens_compra FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at();