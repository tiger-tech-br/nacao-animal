-- Executar inteiro no Query Tool do banco da aplicação (Railway: railway).
-- Reexecutar NÃO altera preços nem repõe estoques de produtos existentes.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('petflow/catalogo-exemplo'));
DO $$
DECLARE
    empresa UUID := get_petflow_empresa_id();
    categoria UUID;
    produto UUID;
    item RECORD;
BEGIN
    IF current_database() NOT IN ('railway', 'petflow_v2') THEN
        RAISE EXCEPTION 'Selecione o banco railway ou petflow_v2 da aplicação';
    END IF;
    FOR item IN SELECT * FROM (VALUES
        ('Rações', 'Ração Canis Prime Adultos 10kg', 'Alimento premium para cães adultos.', 'CANIS-PRIME-10KG', 'PetFlow Prime', 189.90, 128.50, 18, '/images/products/petflow-prime-racao.jpg'),
        ('Rações', 'Ração Felis Prime Gatos Castrados 7,5kg', 'Alimento premium para gatos castrados.', 'FELIS-CAST-75', 'PetFlow Prime', 169.90, 112.30, 14, '/images/products/felis-prime-racao.jpg'),
        ('Petiscos', 'Bifinho Natural Frango 500g', 'Petisco macio para cães de todos os portes.', 'BIF-FRANGO-500', 'Fred Snacks', 34.90, 18.70, 32, '/images/products/fredbites-petiscos.jpg'),
        ('Higiene', 'Shampoo Neutro Pelos Sensíveis 500ml', 'Shampoo suave para banho profissional ou doméstico.', 'SHA-NEUTRO-500', 'FlowCare', 42.90, 21.40, 24, '/images/products/pelozen-shampoo.jpg'),
        ('Higiene', 'Tapete Higiênico Ultra Absorção 30un', 'Tapete higiênico com controle de odor.', 'TAP-ULTRA-30', 'FlowCare', 69.90, 38.20, 20, '/images/products/ultrapad-30.jpg'),
        ('Acessórios', 'Coleira Ajustável Fred Azul', 'Coleira confortável com regulagem reforçada.', 'COL-FRED-AZUL', 'Fred Design', 39.90, 16.50, 26, '/images/products/fred10-coleira.jpg'),
        ('Acessórios', 'Brinquedo Mordedor Dental', 'Brinquedo para estímulo e higiene oral.', 'MOR-DENTAL-01', 'PetJoy', 29.90, 11.80, 30, '/images/products/petjoy-dental.jpg'),
        ('Farmácia Pet', 'Suplemento Ômega Pet 60 cápsulas', 'Suplemento para pele e pelagem.', 'OMEGA-PET-60', 'VitaPet', 54.90, 29.60, 12, '/images/products/vitapet-care-kit.jpg')
    ) AS dados(categoria, nome, descricao, sku, marca, preco, custo, quantidade, foto)
    LOOP
        INSERT INTO categorias (empresa_id,nome,status,ativo)
        VALUES (empresa,item.categoria,TRUE,TRUE) ON CONFLICT (nome) DO NOTHING;
        SELECT id INTO categoria FROM categorias WHERE nome=item.categoria AND empresa_id=empresa;
        IF categoria IS NULL THEN RAISE EXCEPTION 'Categoria pertence a outra empresa: %', item.categoria; END IF;
        INSERT INTO produtos (empresa_id,categoria_id,nome,descricao,sku,marca,preco,custo,preco_venda,preco_custo,foto,status,ativo)
        VALUES (empresa,categoria,item.nome,item.descricao,item.sku,item.marca,item.preco,item.custo,item.preco,item.custo,item.foto,TRUE,TRUE)
        ON CONFLICT (sku) DO NOTHING RETURNING id INTO produto;
        IF produto IS NOT NULL THEN
            INSERT INTO estoque (empresa_id,produto_id,quantidade,estoque_minimo,estoque_maximo,localizacao)
            VALUES (empresa,produto,item.quantidade,5,60,'Prateleira principal')
            ON CONFLICT (empresa_id,produto_id) DO UPDATE SET quantidade=EXCLUDED.quantidade,
                estoque_minimo=EXCLUDED.estoque_minimo,estoque_maximo=EXCLUDED.estoque_maximo,localizacao=EXCLUDED.localizacao;
            RAISE NOTICE 'Cadastrado: %', item.sku;
        ELSE
            RAISE NOTICE 'SKU já existente, preservado: %', item.sku;
        END IF;
    END LOOP;
END $$;
COMMIT;
SELECT p.sku,p.nome,p.preco AS preco_venda,e.quantidade AS estoque
FROM produtos p LEFT JOIN estoque e ON e.produto_id=p.id AND e.empresa_id=p.empresa_id
WHERE p.empresa_id=get_petflow_empresa_id() ORDER BY p.nome;
