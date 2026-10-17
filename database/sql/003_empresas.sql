CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(150) NOT NULL DEFAULT 'PetFlow',
    razao_social VARCHAR(150),
    cnpj VARCHAR(18),
    telefone VARCHAR(20),
    email VARCHAR(150),
    endereco VARCHAR(150),
    numero VARCHAR(10),
    complemento VARCHAR(100),
    bairro VARCHAR(100),
    cidade VARCHAR(100),
    estado CHAR(2),
    cep VARCHAR(9),
    logo TEXT,
    horario_abertura TIME,
    horario_fechamento TIME,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO empresas (nome)
SELECT 'PetFlow'
WHERE NOT EXISTS (
    SELECT 1 FROM empresas
);

CREATE OR REPLACE FUNCTION get_petflow_empresa_id()
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_empresa_id UUID;
BEGIN
    SELECT id
    INTO v_empresa_id
    FROM empresas
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_empresa_id IS NULL THEN
        INSERT INTO empresas (nome)
        VALUES ('PetFlow')
        RETURNING id INTO v_empresa_id;
    END IF;

    RETURN v_empresa_id;
END;
$$;
