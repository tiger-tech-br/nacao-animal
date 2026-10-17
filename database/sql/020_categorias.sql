/*
==========================================================
 PETFLOW
 Arquivo: 020_categorias.sql
 Descrição: Categorias dos produtos.
==========================================================
*/

CREATE TABLE IF NOT EXISTS categorias (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    nome VARCHAR(100) NOT NULL UNIQUE,

    descricao TEXT,

    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_categoria_nome
        CHECK (LENGTH(TRIM(nome)) > 0)
);

/* ==========================================================
   TRIGGER
========================================================== */

DROP TRIGGER IF EXISTS trg_categorias_updated_at ON categorias;
CREATE TRIGGER trg_categorias_updated_at BEFORE UPDATE ON categorias FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at();