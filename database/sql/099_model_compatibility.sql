/*
==========================================================
 PETFLOW
 Arquivo: 099_model_compatibility.sql
 Descricao: Alinha o schema SQL aos models usados pelo backend.
==========================================================
*/

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

SELECT get_petflow_empresa_id();

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id UUID;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_recuperacao VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_expiracao TIMESTAMPTZ;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS empresa_id UUID;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS empresa_id UUID;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS empresa_id UUID;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS empresa_id UUID;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS empresa_id UUID;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS empresa_id UUID;
ALTER TABLE itens_compra ADD COLUMN IF NOT EXISTS empresa_id UUID;
ALTER TABLE itens_venda ADD COLUMN IF NOT EXISTS empresa_id UUID;
ALTER TABLE usuarios_clientes ADD COLUMN IF NOT EXISTS email VARCHAR(150);

UPDATE usuarios_clientes uc
SET email = c.email
FROM clientes c
WHERE uc.cliente_id = c.id
  AND uc.email IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_clientes_cliente_unique
ON usuarios_clientes(cliente_id);

UPDATE usuarios SET empresa_id = get_petflow_empresa_id() WHERE empresa_id IS NULL;
UPDATE clientes SET empresa_id = get_petflow_empresa_id() WHERE empresa_id IS NULL;
UPDATE categorias SET empresa_id = get_petflow_empresa_id() WHERE empresa_id IS NULL;
UPDATE produtos SET empresa_id = get_petflow_empresa_id() WHERE empresa_id IS NULL;
UPDATE fornecedores SET empresa_id = get_petflow_empresa_id() WHERE empresa_id IS NULL;
UPDATE compras SET empresa_id = get_petflow_empresa_id() WHERE empresa_id IS NULL;
UPDATE vendas SET empresa_id = get_petflow_empresa_id() WHERE empresa_id IS NULL;
UPDATE itens_compra SET empresa_id = get_petflow_empresa_id() WHERE empresa_id IS NULL;
UPDATE itens_venda SET empresa_id = get_petflow_empresa_id() WHERE empresa_id IS NULL;

ALTER TABLE usuarios ALTER COLUMN empresa_id SET DEFAULT get_petflow_empresa_id();
ALTER TABLE clientes ALTER COLUMN empresa_id SET DEFAULT get_petflow_empresa_id();
ALTER TABLE categorias ALTER COLUMN empresa_id SET DEFAULT get_petflow_empresa_id();
ALTER TABLE produtos ALTER COLUMN empresa_id SET DEFAULT get_petflow_empresa_id();
ALTER TABLE fornecedores ALTER COLUMN empresa_id SET DEFAULT get_petflow_empresa_id();
ALTER TABLE compras ALTER COLUMN empresa_id SET DEFAULT get_petflow_empresa_id();
ALTER TABLE vendas ALTER COLUMN empresa_id SET DEFAULT get_petflow_empresa_id();
ALTER TABLE itens_compra ALTER COLUMN empresa_id SET DEFAULT get_petflow_empresa_id();
ALTER TABLE itens_venda ALTER COLUMN empresa_id SET DEFAULT get_petflow_empresa_id();

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS status BOOLEAN DEFAULT TRUE;
UPDATE categorias SET status = ativo WHERE status IS NULL;

CREATE OR REPLACE FUNCTION sync_categorias_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.status := COALESCE(NEW.status, NEW.ativo, TRUE);
    NEW.ativo := COALESCE(NEW.ativo, NEW.status, TRUE);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_categorias_status ON categorias;
CREATE TRIGGER trg_sync_categorias_status
BEFORE INSERT OR UPDATE ON categorias
FOR EACH ROW
EXECUTE FUNCTION sync_categorias_status();

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS preco NUMERIC(10,2);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS custo NUMERIC(10,2);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS status BOOLEAN DEFAULT TRUE;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(50);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS sku VARCHAR(50);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS marca VARCHAR(100);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS unidade_medida VARCHAR(20) NOT NULL DEFAULT 'UN';
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS foto TEXT;

UPDATE produtos
SET
    preco = COALESCE(preco, preco_venda),
    custo = COALESCE(custo, preco_custo),
    status = COALESCE(status, ativo);

CREATE OR REPLACE FUNCTION sync_produtos_commerce()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.preco := COALESCE(NEW.preco, NEW.preco_venda, 0);
    NEW.custo := COALESCE(NEW.custo, NEW.preco_custo, 0);
    NEW.preco_venda := COALESCE(NEW.preco_venda, NEW.preco, 0);
    NEW.preco_custo := COALESCE(NEW.preco_custo, NEW.custo, 0);
    NEW.status := COALESCE(NEW.status, NEW.ativo, TRUE);
    NEW.ativo := COALESCE(NEW.ativo, NEW.status, TRUE);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_produtos_commerce ON produtos;
CREATE TRIGGER trg_sync_produtos_commerce
BEFORE INSERT OR UPDATE ON produtos
FOR EACH ROW
EXECUTE FUNCTION sync_produtos_commerce();


ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS nome VARCHAR(150);
UPDATE fornecedores SET nome = COALESCE(nome, nome_fantasia, razao_social);

CREATE OR REPLACE FUNCTION sync_fornecedores_nome()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.nome := COALESCE(NEW.nome, NEW.nome_fantasia, NEW.razao_social);
    NEW.razao_social := COALESCE(NEW.razao_social, NEW.nome, 'Fornecedor');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_fornecedores_nome ON fornecedores;
CREATE TRIGGER trg_sync_fornecedores_nome
BEFORE INSERT OR UPDATE ON fornecedores
FOR EACH ROW
EXECUTE FUNCTION sync_fornecedores_nome();

ALTER TABLE vendas ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(40);
ALTER TABLE vendas ALTER COLUMN usuario_id DROP NOT NULL;
ALTER TABLE vendas ALTER COLUMN status TYPE VARCHAR(30);
ALTER TABLE vendas ALTER COLUMN status SET DEFAULT 'AGUARDANDO_PAGAMENTO';

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'vendas'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE vendas DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END LOOP;
END;
$$;

ALTER TABLE vendas
ADD CONSTRAINT chk_vendas_status
CHECK (
    status IN (
        'PENDENTE',
        'AGUARDANDO_PAGAMENTO',
        'PAGAMENTO_APROVADO',
        'EM_SEPARACAO',
        'SAIU_PARA_ENTREGA',
        'ENTREGUE',
        'FINALIZADA',
        'CANCELADA'
    )
);

CREATE OR REPLACE FUNCTION sync_vendas_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.desconto := COALESCE(NEW.desconto, 0);
    NEW.acrescimo := COALESCE(NEW.acrescimo, 0);
    NEW.valor_total := COALESCE(NEW.valor_total, 0);
    -- Compatível antes e depois da migração de frete; scripts são reaplicados no deploy.
    NEW.valor_final := NEW.valor_total - NEW.desconto + NEW.acrescimo
        + COALESCE((to_jsonb(NEW)->>'valor_frete')::NUMERIC, 0);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vendas_total ON vendas;
CREATE TRIGGER trg_sync_vendas_total
BEFORE INSERT OR UPDATE ON vendas
FOR EACH ROW
EXECUTE FUNCTION sync_vendas_total();

ALTER TABLE itens_compra ADD COLUMN IF NOT EXISTS valor_unitario NUMERIC(10,2);
ALTER TABLE itens_venda ADD COLUMN IF NOT EXISTS valor_unitario NUMERIC(10,2);

CREATE OR REPLACE FUNCTION sync_itens_compra_valor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.valor_unitario := COALESCE(NEW.valor_unitario, NEW.preco_unitario, 0);
    NEW.preco_unitario := COALESCE(NEW.preco_unitario, NEW.valor_unitario, 0);
    NEW.subtotal := COALESCE(NEW.subtotal, NEW.quantidade * NEW.valor_unitario, 0);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_itens_compra_valor ON itens_compra;
CREATE TRIGGER trg_sync_itens_compra_valor
BEFORE INSERT OR UPDATE ON itens_compra
FOR EACH ROW
EXECUTE FUNCTION sync_itens_compra_valor();

CREATE OR REPLACE FUNCTION sync_itens_venda_valor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.valor_unitario := COALESCE(NEW.valor_unitario, NEW.preco_unitario, 0);
    NEW.preco_unitario := COALESCE(NEW.preco_unitario, NEW.valor_unitario, 0);
    NEW.subtotal := COALESCE(NEW.subtotal, NEW.quantidade * NEW.valor_unitario, 0);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_itens_venda_valor ON itens_venda;
CREATE TRIGGER trg_sync_itens_venda_valor
BEFORE INSERT OR UPDATE ON itens_venda
FOR EACH ROW
EXECUTE FUNCTION sync_itens_venda_valor();

CREATE TABLE IF NOT EXISTS estoque (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID DEFAULT get_petflow_empresa_id(),
    produto_id UUID NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 0,
    estoque_minimo INTEGER NOT NULL DEFAULT 0,
    estoque_maximo INTEGER,
    localizacao VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_estoque_produto
        FOREIGN KEY (produto_id)
        REFERENCES produtos(id)
        ON DELETE CASCADE,
    CONSTRAINT chk_estoque_quantidade
        CHECK (quantidade >= 0),
    CONSTRAINT chk_estoque_minimo_model
        CHECK (estoque_minimo >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_empresa_produto
ON estoque(empresa_id, produto_id);


CREATE TABLE IF NOT EXISTS financeiro (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID DEFAULT get_petflow_empresa_id(),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('RECEBER', 'PAGAR')),
    origem VARCHAR(40),
    referencia_id UUID,
    descricao TEXT NOT NULL,
    valor NUMERIC(10,2) NOT NULL DEFAULT 0,
    valor_pago NUMERIC(10,2) NOT NULL DEFAULT 0,
    data_vencimento DATE NOT NULL,
    data_pagamento DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
        CHECK (status IN ('PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO')),
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financeiro_empresa
ON financeiro(empresa_id);

CREATE INDEX IF NOT EXISTS idx_financeiro_status
ON financeiro(status);
