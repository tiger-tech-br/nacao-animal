-- pgAdmin: selecione o banco usado pelo site, abra Query Tool e execute inteiro.
-- Edite os valores abaixo. Troque o SKU para cada produto diferente.
BEGIN;
DO $$
DECLARE
    loja UUID := get_petflow_empresa_id();
    categoria_id_nova UUID;
    produto_id_novo UUID;
    nome_categoria TEXT := 'Rações';
    nome_produto TEXT := 'ALTERE O NOME DO PRODUTO';
    sku_produto TEXT := 'ALTERE-O-SKU';
    descricao_produto TEXT := 'Descrição do produto';
    marca_produto TEXT := 'Marca';
    preco_produto NUMERIC := 89.90;
    custo_produto NUMERIC := 55.00;
    quantidade_inicial INTEGER := 10;
    foto_produto TEXT := '/images/products/petflow-prime-racao.jpg';
BEGIN
    IF current_database() NOT IN ('railway','petflow_v2') THEN RAISE EXCEPTION 'Selecione o banco correto da aplicação'; END IF;
    IF sku_produto='ALTERE-O-SKU' OR nome_produto='ALTERE O NOME DO PRODUTO' THEN
        RAISE EXCEPTION 'Preencha o nome e o SKU antes de executar';
    END IF;
    IF quantidade_inicial<0 THEN RAISE EXCEPTION 'Estoque inicial não pode ser negativo'; END IF;
    INSERT INTO categorias (empresa_id,nome,status,ativo) VALUES (loja,nome_categoria,TRUE,TRUE)
    ON CONFLICT (nome) DO NOTHING;
    SELECT id INTO categoria_id_nova FROM categorias WHERE nome=nome_categoria AND empresa_id=loja;
    IF categoria_id_nova IS NULL THEN RAISE EXCEPTION 'Categoria pertence a outra empresa'; END IF;

    INSERT INTO produtos (empresa_id,categoria_id,nome,descricao,sku,marca,preco,custo,preco_venda,preco_custo,foto,status,ativo)
    VALUES (loja,categoria_id_nova,nome_produto,descricao_produto,sku_produto,marca_produto,preco_produto,custo_produto,preco_produto,custo_produto,foto_produto,TRUE,TRUE)
    ON CONFLICT (sku) DO NOTHING RETURNING id INTO produto_id_novo;
    IF produto_id_novo IS NULL THEN RAISE EXCEPTION 'SKU já existe. Nenhum preço ou estoque foi alterado.'; END IF;
    INSERT INTO estoque (empresa_id,produto_id,quantidade,estoque_minimo,estoque_maximo,localizacao)
    VALUES (loja,produto_id_novo,quantidade_inicial,0,GREATEST(quantidade_inicial,60),'Prateleira principal')
    ON CONFLICT (empresa_id,produto_id) DO UPDATE SET quantidade=EXCLUDED.quantidade;
    RAISE NOTICE 'Produto cadastrado: %', sku_produto;
END $$;
COMMIT;

SELECT p.sku,p.nome,p.preco,p.custo,e.quantidade AS estoque,p.ativo
FROM produtos p LEFT JOIN estoque e ON e.produto_id=p.id AND e.empresa_id=p.empresa_id
WHERE p.empresa_id=get_petflow_empresa_id() ORDER BY p.created_at DESC;
