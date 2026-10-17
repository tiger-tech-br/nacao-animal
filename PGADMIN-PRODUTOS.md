# Cadastro de produtos no pgAdmin

O pgAdmin é o cliente de administração. Para esta instalação local, use o banco `nacao-animal`. Se ele já foi criado, não é necessário criá-lo novamente. O site usa o servidor e o banco configurados no `.env`; ter o banco cadastrado no pgAdmin não configura a conexão da aplicação.

Configure `DB_NAME=nacao-animal`, `DB_EXPECTED_NAME=nacao-animal`, `DB_USER` e `DB_PASSWORD` no `.env`, ajustando `DB_HOST` e `DB_PORT` se necessário. Mantenha `DATABASE_URL`, `POSTGRES_URL` e `DATABASE_PUBLIC_URL` vazias para usar a conexão local; essas URLs têm precedência sobre os campos separados. A conexão precisa ser validada com as credenciais locais. Antes de cadastrar produtos, execute `npm run db:migrate` no terminal para criar as tabelas.

1. No pgAdmin, use o servidor PostgreSQL local, expanda **Databases → nacao-animal** e abra **Query Tool**.
2. Confira a conexão antes de escrever:

```sql
SELECT current_database() AS banco, inet_server_addr() AS servidor,
       current_user AS usuario, to_regclass('public.produtos') AS tabela;
```

3. Opcionalmente, para carregar 8 produtos de demonstração, abra **database/catalogo-exemplo.sql** no Query Tool e execute o arquivo inteiro com **F5**. Repetir o arquivo preserva os SKUs existentes, preços e saldos. Pule essa etapa se for cadastrar apenas produtos reais da loja.
4. Para cadastrar outro produto, abra **database/cadastrar-produto.sql**. Preencha nome, SKU exclusivo, categoria, marca, descrição, custo, preço, quantidade inicial e foto no bloco DECLARE. Execute o arquivo inteiro com **F5**. Se ocorrer erro, execute `ROLLBACK;`, ajuste os dados e tente novamente.

As fotos devem ser URLs válidas de imagens ou caminhos já existentes no site, como `/images/products/petflow-prime-racao.jpg`. Caminhos do seu computador não aparecem para os clientes. Preço deve ser maior ou igual ao custo conforme a regra atual do banco.

Para consultar o catálogo e o saldo usado pela loja:

```sql
SELECT p.sku, p.nome, c.nome AS categoria, p.preco AS preco_venda,
       p.custo, e.quantidade AS estoque, p.ativo
FROM produtos p
JOIN categorias c ON c.id = p.categoria_id
LEFT JOIN estoque e ON e.produto_id = p.id AND e.empresa_id = p.empresa_id
WHERE p.empresa_id = get_petflow_empresa_id()
ORDER BY p.nome;
```

O cadastro mantém os campos compatíveis (`preco`/`preco_venda`, `custo`/`preco_custo`, `ativo`/`status`) e grava o saldo na tabela `estoque`. Não altere apenas `produtos.estoque_atual`, pois o checkout usa a tabela `estoque`. Para reposição e ajustes posteriores, prefira o painel de estoque.

No terminal, o mesmo catálogo opcional pode ser inserido com `npm run db:seed-catalog`. O comando usa a conexão configurada no `.env`.

Quando o banco do Railway for criado, configure `DATABASE_URL` com a referência privada do PostgreSQL e `DB_EXPECTED_NAME` com o nome daquele banco, conforme o README. No pgAdmin, o acesso ao Railway usa a conexão pública disponibilizada pelo serviço. Não rode testes de integração de banco contra produção; o teste existente recusa conexões remotas.
