/* Cadastro operacional: o transporte da viagem é copiado ao gerar seu link. */
CREATE TABLE IF NOT EXISTS entregadores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL CHECK (LENGTH(TRIM(nome)) BETWEEN 2 AND 150),
    telefone VARCHAR(20),
    meio_transporte TEXT NOT NULL CHECK (meio_transporte IN ('CARRO', 'MOTO', 'BICICLETA', 'A_PE')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entregadores_empresa_nome
ON entregadores(empresa_id, nome);

CREATE INDEX IF NOT EXISTS idx_entregadores_empresa_ativo
ON entregadores(empresa_id, ativo);

DROP TRIGGER IF EXISTS trg_entregadores_updated_at ON entregadores;
CREATE TRIGGER trg_entregadores_updated_at BEFORE UPDATE ON entregadores
FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();

/* Links legados conservam o perfil de carro. Editar um cadastro não muda
   o transporte já atribuído a uma viagem em andamento. */
ALTER TABLE entrega_rastreamento
ADD COLUMN IF NOT EXISTS entregador_id UUID REFERENCES entregadores(id) ON DELETE SET NULL;

ALTER TABLE entrega_rastreamento
ADD COLUMN IF NOT EXISTS meio_transporte TEXT NOT NULL DEFAULT 'CARRO';

ALTER TABLE entrega_rastreamento
DROP CONSTRAINT IF EXISTS entrega_rastreamento_meio_transporte_check;

ALTER TABLE entrega_rastreamento
ADD CONSTRAINT entrega_rastreamento_meio_transporte_check
CHECK (meio_transporte IN ('CARRO', 'MOTO', 'BICICLETA', 'A_PE'));
