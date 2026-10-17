/*
==========================================================
 PETFLOW
 Arquivo: 062_newsletter_inscritos.sql
 Descrição: Inscritos da newsletter pública da PetFlow.
==========================================================
*/

CREATE TABLE IF NOT EXISTS newsletter_inscritos (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    empresa_id UUID NOT NULL DEFAULT get_petflow_empresa_id(),

    nome VARCHAR(150),

    email VARCHAR(150) NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'ATIVO'
        CHECK (
            status IN (
                'ATIVO',
                'INATIVO',
                'CANCELADO'
            )
        ),

    origem VARCHAR(80) NOT NULL DEFAULT 'SITE',

    consentimento BOOLEAN NOT NULL DEFAULT TRUE,

    data_inscricao TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    data_cancelamento TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_newsletter_inscritos_empresa
        FOREIGN KEY (empresa_id)
        REFERENCES empresas(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_newsletter_inscritos_nome
        CHECK (
            nome IS NULL
            OR LENGTH(TRIM(nome)) > 0
        ),

    CONSTRAINT chk_newsletter_inscritos_email
        CHECK (
            LENGTH(TRIM(email)) > 0
            AND email LIKE '%@%'
        ),

    CONSTRAINT chk_newsletter_inscritos_cancelamento
        CHECK (
            status <> 'CANCELADO'
            OR data_cancelamento IS NOT NULL
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_inscritos_empresa_email
ON newsletter_inscritos(empresa_id, LOWER(email));

CREATE INDEX IF NOT EXISTS idx_newsletter_inscritos_status
ON newsletter_inscritos(empresa_id, status);

DROP TRIGGER IF EXISTS trg_newsletter_inscritos_updated_at ON newsletter_inscritos;
CREATE TRIGGER trg_newsletter_inscritos_updated_at BEFORE UPDATE ON newsletter_inscritos FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at();
