/*
==========================================================
 PETFLOW
 Arquivo: 024_compras.sql
 Descrição: Registro das compras realizadas aos fornecedores.
==========================================================
*/

CREATE TABLE IF NOT EXISTS compras (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    fornecedor_id UUID NOT NULL,

    usuario_id UUID,

    numero_nota_fiscal VARCHAR(50),

    data_compra DATE NOT NULL,

    data_recebimento DATE,

    valor_total NUMERIC(10,2) NOT NULL DEFAULT 0,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
        CHECK (
            status IN (
                'PENDENTE',
                'RECEBIDA',
                'CANCELADA'
            )
        ),

    observacoes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_compras_fornecedor
        FOREIGN KEY (fornecedor_id)
        REFERENCES fornecedores(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_compras_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_compra_valor_total
        CHECK (valor_total >= 0),

    CONSTRAINT chk_compra_nota_fiscal
        CHECK (
            numero_nota_fiscal IS NULL
            OR LENGTH(TRIM(numero_nota_fiscal)) > 0
        ),

    CONSTRAINT chk_compra_observacoes
        CHECK (
            observacoes IS NULL
            OR LENGTH(TRIM(observacoes)) > 0
        )
);

ALTER TABLE compras ADD COLUMN IF NOT EXISTS fornecedor_id UUID;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS usuario_id UUID;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS numero_nota_fiscal VARCHAR(50);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS data_compra DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS data_recebimento DATE;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS observacoes TEXT;

/* ==========================================================
   ÍNDICES
========================================================== */

CREATE INDEX IF NOT EXISTS idx_compras_fornecedor
ON compras(fornecedor_id);

CREATE INDEX IF NOT EXISTS idx_compras_usuario
ON compras(usuario_id);

CREATE INDEX IF NOT EXISTS idx_compras_data
ON compras(data_compra);

CREATE INDEX IF NOT EXISTS idx_compras_status
ON compras(status);

CREATE INDEX IF NOT EXISTS idx_compras_nota
ON compras(numero_nota_fiscal);

/* ==========================================================
   TRIGGER
========================================================== */

DROP TRIGGER IF EXISTS trg_compras_updated_at ON compras;
CREATE TRIGGER trg_compras_updated_at BEFORE UPDATE ON compras FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at();