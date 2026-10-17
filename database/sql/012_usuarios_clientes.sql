/*
==========================================================
 PETFLOW
 Arquivo: 012_usuarios_clientes.sql
 Descrição: Login dos clientes da loja.
==========================================================
*/

CREATE TABLE IF NOT EXISTS usuarios_clientes (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id UUID NOT NULL UNIQUE,

    senha_hash TEXT NOT NULL,

    email_verificado BOOLEAN NOT NULL DEFAULT FALSE,

    token_recuperacao VARCHAR(255),

    token_expiracao TIMESTAMPTZ,

    ultimo_login TIMESTAMPTZ,

    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_usuarios_clientes_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_usuario_cliente_senha
        CHECK (LENGTH(TRIM(senha_hash)) > 0)
);

ALTER TABLE usuarios_clientes
ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE usuarios_clientes
ADD COLUMN IF NOT EXISTS token_recuperacao VARCHAR(255);

ALTER TABLE usuarios_clientes
ADD COLUMN IF NOT EXISTS token_expiracao TIMESTAMPTZ;

ALTER TABLE usuarios_clientes
ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMPTZ;


/* ==========================================================
   ÍNDICES
========================================================== */

CREATE INDEX IF NOT EXISTS idx_usuarios_clientes_email_verificado
ON usuarios_clientes(email_verificado);

CREATE INDEX IF NOT EXISTS idx_usuarios_clientes_ultimo_login
ON usuarios_clientes(ultimo_login);

/* ==========================================================
   TRIGGER
========================================================== */

DROP TRIGGER IF EXISTS trg_usuarios_clientes_updated_at ON usuarios_clientes;
CREATE TRIGGER trg_usuarios_clientes_updated_at BEFORE UPDATE ON usuarios_clientes FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at();