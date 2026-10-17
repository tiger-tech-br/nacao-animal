/*
==========================================================
 PETFLOW
 Arquivo: 061_configuracoes.sql
 Descrição: Configurações gerais do sistema.
==========================================================
*/

CREATE TABLE IF NOT EXISTS configuracoes (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    nome_petshop VARCHAR(150) NOT NULL,

    cnpj VARCHAR(18),

    telefone VARCHAR(20),

    whatsapp VARCHAR(20),

    email VARCHAR(150),

    cep VARCHAR(9),

    endereco VARCHAR(150),

    numero VARCHAR(10),

    complemento VARCHAR(100),

    bairro VARCHAR(100),

    cidade VARCHAR(100),

    estado CHAR(2),

    horario_abertura TIME,

    horario_fechamento TIME,

    logo TEXT,

    instagram VARCHAR(255),

    facebook VARCHAR(255),

    site VARCHAR(255),

    chave_pix VARCHAR(255),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_configuracoes_nome
        CHECK (
            LENGTH(TRIM(nome_petshop)) > 0
        ),

    CONSTRAINT chk_configuracoes_estado
        CHECK (
            estado IS NULL
            OR estado IN (
                'AC','AL','AP','AM','BA','CE','DF','ES',
                'GO','MA','MT','MS','MG','PA','PB','PR',
                'PE','PI','RJ','RN','RS','RO','RR','SC',
                'SP','SE','TO'
            )
        ),

    CONSTRAINT chk_configuracoes_horario
        CHECK (
            horario_abertura IS NULL
            OR horario_fechamento IS NULL
            OR horario_abertura < horario_fechamento
        ),

    CONSTRAINT chk_configuracoes_email
        CHECK (
            email IS NULL
            OR LENGTH(TRIM(email)) > 0
        ),

    CONSTRAINT chk_configuracoes_endereco
        CHECK (
            endereco IS NULL
            OR LENGTH(TRIM(endereco)) > 0
        ),

    CONSTRAINT chk_configuracoes_bairro
        CHECK (
            bairro IS NULL
            OR LENGTH(TRIM(bairro)) > 0
        ),

    CONSTRAINT chk_configuracoes_cidade
        CHECK (
            cidade IS NULL
            OR LENGTH(TRIM(cidade)) > 0
        )
);

/* ==========================================================
   ÍNDICES
========================================================== */

CREATE INDEX IF NOT EXISTS idx_configuracoes_nome
ON configuracoes(nome_petshop);

/* ==========================================================
   TRIGGER
========================================================== */

DROP TRIGGER IF EXISTS trg_configuracoes_updated_at ON configuracoes;
CREATE TRIGGER trg_configuracoes_updated_at BEFORE UPDATE ON configuracoes FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at();
