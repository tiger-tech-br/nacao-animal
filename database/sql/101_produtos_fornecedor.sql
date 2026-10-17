/*
==========================================================
 PETFLOW
 Arquivo: 101_produtos_fornecedor.sql
 Descrição: Vincula produtos aos fornecedores cadastrados.
==========================================================
*/

ALTER TABLE produtos
ADD COLUMN IF NOT EXISTS fornecedor_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_produtos_fornecedor'
          AND conrelid = 'produtos'::regclass
    ) THEN
        ALTER TABLE produtos
        ADD CONSTRAINT fk_produtos_fornecedor
        FOREIGN KEY (fornecedor_id)
        REFERENCES fornecedores(id)
        ON DELETE SET NULL;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_produtos_fornecedor
ON produtos(fornecedor_id);
