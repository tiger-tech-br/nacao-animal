/*
==========================================================
 PETFLOW
 Arquivo: 100_unificar_empresa_petflow.sql
 Descricao: Garante que o sistema trabalhe como uma unica loja PetFlow.
==========================================================
*/

DO $$
DECLARE
    v_empresa_id UUID;
BEGIN
    v_empresa_id := get_petflow_empresa_id();

    UPDATE usuarios SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;
    UPDATE clientes SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;
    UPDATE categorias SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;
    UPDATE produtos SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;
    UPDATE fornecedores SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;
    UPDATE compras SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;
    UPDATE vendas SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;
    UPDATE itens_compra SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;
    UPDATE itens_venda SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;

    IF to_regclass('public.estoque') IS NOT NULL THEN
        UPDATE estoque SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;
    END IF;

    IF to_regclass('public.financeiro') IS NOT NULL THEN
        UPDATE financeiro SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;
    END IF;

    IF to_regclass('public.newsletter_inscritos') IS NOT NULL THEN
        UPDATE newsletter_inscritos SET empresa_id = v_empresa_id WHERE empresa_id IS DISTINCT FROM v_empresa_id;
    END IF;

    IF to_regclass('public.usuarios_clientes') IS NOT NULL THEN
        UPDATE clientes c
        SET empresa_id = v_empresa_id
        WHERE EXISTS (
            SELECT 1
            FROM usuarios_clientes uc
            WHERE uc.cliente_id = c.id
        )
        AND c.empresa_id IS DISTINCT FROM v_empresa_id;
    END IF;
END $$;
