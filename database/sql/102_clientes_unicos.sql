/*
==========================================================
 PETFLOW
 Arquivo: 102_clientes_unicos.sql
 Descricao: Reforca unicidade de e-mail, CPF, telefone e celular dos clientes.
==========================================================
*/

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM clientes
        WHERE email IS NOT NULL
          AND TRIM(email) <> ''
        GROUP BY LOWER(TRIM(email))
        HAVING COUNT(*) > 1
    ) THEN
        EXECUTE '
            CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_email_unico
            ON clientes (LOWER(TRIM(email)))
            WHERE email IS NOT NULL
              AND TRIM(email) <> ''''
        ';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM clientes
        WHERE cpf IS NOT NULL
          AND REGEXP_REPLACE(cpf, '\D', '', 'g') <> ''
        GROUP BY REGEXP_REPLACE(cpf, '\D', '', 'g')
        HAVING COUNT(*) > 1
    ) THEN
        EXECUTE '
            CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_cpf_unico
            ON clientes (REGEXP_REPLACE(cpf, ''\D'', '''', ''g''))
            WHERE cpf IS NOT NULL
              AND REGEXP_REPLACE(cpf, ''\D'', '''', ''g'') <> ''''
        ';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM clientes
        WHERE telefone IS NOT NULL
          AND REGEXP_REPLACE(telefone, '\D', '', 'g') <> ''
        GROUP BY REGEXP_REPLACE(telefone, '\D', '', 'g')
        HAVING COUNT(*) > 1
    ) THEN
        EXECUTE '
            CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_telefone_unico
            ON clientes (REGEXP_REPLACE(telefone, ''\D'', '''', ''g''))
            WHERE telefone IS NOT NULL
              AND REGEXP_REPLACE(telefone, ''\D'', '''', ''g'') <> ''''
        ';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM clientes
        WHERE whatsapp IS NOT NULL
          AND REGEXP_REPLACE(whatsapp, '\D', '', 'g') <> ''
        GROUP BY REGEXP_REPLACE(whatsapp, '\D', '', 'g')
        HAVING COUNT(*) > 1
    ) THEN
        EXECUTE '
            CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_whatsapp_unico
            ON clientes (REGEXP_REPLACE(whatsapp, ''\D'', '''', ''g''))
            WHERE whatsapp IS NOT NULL
              AND REGEXP_REPLACE(whatsapp, ''\D'', '''', ''g'') <> ''''
        ';
    END IF;
END $$;
