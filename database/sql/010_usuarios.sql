/*
==========================================================
 PETFLOW
 Arquivo: 010_usuarios.sql
 Descrição: Usuários administrativos do sistema.
==========================================================
*/

CREATE TABLE IF NOT EXISTS usuarios (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    nome VARCHAR(150) NOT NULL,

    email VARCHAR(150) NOT NULL UNIQUE,

    senha_hash TEXT NOT NULL,

    perfil VARCHAR(20) NOT NULL
        CHECK (
            perfil IN (
                'ADMIN',
                'GERENTE'
            )
        ),

    foto_perfil TEXT,

    ultimo_login TIMESTAMPTZ,

    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_usuario_nome
        CHECK (LENGTH(TRIM(nome)) > 0),

    CONSTRAINT chk_usuario_email
        CHECK (LENGTH(TRIM(email)) > 0)
);

/* ==========================================================
   ÍNDICES
========================================================== */

CREATE INDEX IF NOT EXISTS idx_usuarios_nome
ON usuarios(nome);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email_lower
ON usuarios(LOWER(email));

CREATE INDEX IF NOT EXISTS idx_usuarios_perfil
ON usuarios(perfil);

/* ==========================================================
   TRIGGER
========================================================== */

DROP TRIGGER IF EXISTS trg_usuarios_updated_at ON usuarios;
CREATE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON usuarios FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at();