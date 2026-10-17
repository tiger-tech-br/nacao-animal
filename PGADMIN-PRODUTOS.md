# Cadastro de produtos no pgAdmin

O pgAdmin é o cliente de administração. Registrar nele o servidor do Railway permite acessar o banco existente; não é preciso criar outro banco local chamado railway. O site só enxerga os dados do servidor/banco apontados por DATABASE_URL.

Nesta revisão a conexão do `.env` foi confirmada no PostgreSQL remoto, banco `railway`. Foi adicionado `DB_EXPECTED_NAME=railway`, sem alterar as credenciais. POSTGRES_URL e DATABASE_PUBLIC_URL podem continuar vazias: DATABASE_URL já está preenchida e tem precedência.

1. No pgAdmin, use o servidor remoto do Railway (host público e porta do PostgreSQL, conforme sua conexão), expanda **Databases → railway** e abra **Query Tool**.
2. Confira a conexão antes de escrever:

```sql
SELECT current_database() AS banco, inet_server_addr() AS servidor,
       current_user AS usuario, to_regclass('public.produtos') AS tabela;
```

3. Para os mesmos 8 exemplos, abra **database/catalogo-exemplo.sql** no Query Tool e execute o arquivo inteiro com **F5**. Eles já foram cadastrados no Railway nesta revisão; repetir o arquivo preserva os SKUs existentes, preços e saldos.
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

No terminal, o mesmo catálogo pode ser inserido com `npm run db:seed-catalog`. Como o `.env` atual aponta ao Railway, esse comando atua no banco remoto. Não rode testes de integração de banco contra produção; o teste existente recusa conexões remotas.

## Checkout: resultado da revisão em 01/10/2026

Os 8 produtos foram confirmados no banco Railway e no catálogo público. A reexecução do cadastro preservou seus preços e estoques.

As correções locais do PagBank incluem desconto e acréscimo no valor enviado, distinguem o identificador do checkout do identificador do pagamento e impedem que a expiração de um checkout cancele um pedido já pago. A atualização do pagamento usa uma transação e o email de mudança de status só é enviado quando o status persistido realmente muda. Essas alterações de código ainda precisam ser publicadas no Railway.

Validação local: 16 testes passaram, nenhum falhou e 1 teste de integração com PostgreSQL local foi ignorado. A chamada para criar um checkout de diagnóstico foi recusada na solicitação de permissão; por isso a aceitação pela API real e o fluxo completo de pagamento ainda não foram confirmados.

Na configuração de produção inspecionada falta `GOOGLE_MAPS_API_KEY`. O cálculo obrigatório de frete bloqueia novas compras com entrega enquanto essa chave não estiver configurada com acesso à Routes API. A presença do token PagBank, sozinha, não confirma uma compra completa.
