/*
==========================================================
 PETFLOW
 Arquivo: 021_produtos.sql
 Descrição: Cadastro de produtos da loja.
==========================================================
*/

CREATE TABLE IF NOT EXISTS produtos (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    categoria_id UUID NOT NULL,

    nome VARCHAR(150) NOT NULL,

    descricao TEXT,

    codigo_barras VARCHAR(50) UNIQUE,

    sku VARCHAR(50) UNIQUE,

    marca VARCHAR(100),

    unidade_medida VARCHAR(20) NOT NULL DEFAULT 'UN',

    preco_custo NUMERIC(10,2) NOT NULL,

    preco_venda NUMERIC(10,2) NOT NULL,

    estoque_minimo INTEGER NOT NULL DEFAULT 0,

    estoque_atual INTEGER NOT NULL DEFAULT 0,

    foto TEXT,

    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_produtos_categoria
        FOREIGN KEY (categoria_id)
        REFERENCES categorias(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_produto_nome
        CHECK (LENGTH(TRIM(nome)) > 0),

    CONSTRAINT chk_produto_unidade
        CHECK (LENGTH(TRIM(unidade_medida)) > 0),

    CONSTRAINT chk_preco_custo
        CHECK (preco_custo >= 0),

    CONSTRAINT chk_preco_venda
        CHECK (preco_venda >= 0),

    CONSTRAINT chk_preco_venda_maior_custo
        CHECK (preco_venda >= preco_custo),

    CONSTRAINT chk_estoque_atual
        CHECK (estoque_atual >= 0),

    CONSTRAINT chk_estoque_minimo
        CHECK (estoque_minimo >= 0)
);

/* ==========================================================
   ÍNDICES
========================================================== */

CREATE INDEX IF NOT EXISTS idx_produtos_nome
ON produtos(nome);

CREATE INDEX IF NOT EXISTS idx_produtos_categoria
ON produtos(categoria_id);

/* ==========================================================
   TRIGGER
========================================================== */

DROP TRIGGER IF EXISTS trg_produtos_updated_at ON produtos;
CREATE TRIGGER trg_produtos_updated_at BEFORE UPDATE ON produtos FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at();