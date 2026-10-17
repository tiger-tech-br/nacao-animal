/*
==========================================================
 PETFLOW
 Arquivo: 103_clientes_cpf_validacao.sql
 Descricao: Valida o formato do CPF dos clientes em novos cadastros e atualizacoes.
==========================================================
*/

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_clientes_cpf_formato'
    ) THEN
        ALTER TABLE clientes
        ADD CONSTRAINT chk_clientes_cpf_formato
        CHECK (
            cpf IS NULL
            OR TRIM(cpf) = ''
            OR REGEXP_REPLACE(cpf, '\D', '', 'g') ~ '^\d{11}$'
        )
        NOT VALID;
    END IF;
END $$;
