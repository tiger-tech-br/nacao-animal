/*
==========================================================
 PETFLOW
 Arquivo: 011_clientes.sql
 Descrição: Cadastro dos clientes da loja.
==========================================================
*/

CREATE TABLE IF NOT EXISTS clientes (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    nome VARCHAR(150) NOT NULL,

    cpf VARCHAR(14) UNIQUE,

    data_nascimento DATE,

    telefone VARCHAR(20) NOT NULL,

    whatsapp VARCHAR(20),

    email VARCHAR(150) NOT NULL UNIQUE,

    cep VARCHAR(9),

    endereco VARCHAR(150),

    numero VARCHAR(10),

    complemento VARCHAR(100),

    bairro VARCHAR(100),

    cidade VARCHAR(100),

    estado CHAR(2),

    observacoes TEXT,

    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_cliente_nome
        CHECK (LENGTH(TRIM(nome)) > 0),

    CONSTRAINT chk_cliente_email
        CHECK (LENGTH(TRIM(email)) > 0),

    CONSTRAINT chk_cliente_telefone
        CHECK (LENGTH(TRIM(telefone)) > 0),

    CONSTRAINT chk_cliente_estado
        CHECK (
            estado IS NULL
            OR LENGTH(TRIM(estado)) = 2
        )
);

/* ==========================================================
   ÍNDICES
========================================================== */

CREATE INDEX IF NOT EXISTS idx_clientes_nome
ON clientes(nome);

CREATE INDEX IF NOT EXISTS idx_clientes_telefone
ON clientes(telefone);

CREATE INDEX IF NOT EXISTS idx_clientes_cidade
ON clientes(cidade);

/* ==========================================================
   TRIGGER
========================================================== */

DROP TRIGGER IF EXISTS trg_clientes_updated_at ON clientes;
CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON clientes FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at();