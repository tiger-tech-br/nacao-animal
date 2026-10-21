# Produtos baratos para testes

O usuário autorizou seis produtos aleatórios de teste, com preços de R$ 6 e R$ 10. Os itens ficam identificados com `[TESTE]`, possuem SKUs `NA-TESTE-*` e não representam estoque físico confirmado. Cada cadastro novo recebe cinco unidades no controle de estoque da aplicação.

| Categoria | Produto | Preço | Estoque inicial |
| --- | --- | ---: | ---: |
| Cães | [TESTE] Saquinhos higiênicos para cães | R$ 6,00 | 5 |
| Gatos | [TESTE] Varinha para gatos | R$ 6,00 | 5 |
| Aves | [TESTE] Poleiro para aves | R$ 6,00 | 5 |
| Peixes | [TESTE] Enfeite para aquário de peixes | R$ 10,00 | 5 |
| Roedores | [TESTE] Mordedor para hamster e roedores | R$ 6,00 | 5 |
| Acessórios | [TESTE] Bolinha para pets | R$ 10,00 | 5 |

Prévia sem conexão ao banco:

```powershell
node scripts/seed-test-products.js
```

Cadastro no banco configurado no `.env`:

```powershell
node scripts/seed-test-products.js --apply
```

O script usa a validação `DB_EXPECTED_NAME` existente, confere o banco conectado e usa a mesma empresa pública do catálogo. Precisa das migrações já aplicadas e de uma loja existente. Não cria empresas, clientes, pedidos nem credenciais.

O cadastro acontece em uma transação com bloqueio de concorrência. Cada produto novo recebe estoque, movimentação de entrada e registro de auditoria. Reexecutar preserva produtos que já tenham o mesmo SKU: não altera preço, status, categoria, descrição nem estoque, inclusive depois de uma compra. Categorias preexistentes são preservadas; conflitos com outra empresa interrompem a transação inteira.

O custo é zero por se tratar de dados sintéticos. Não são atribuídas marcas, avaliações ou fotos que não correspondam ao item. Na carga inicial, os itens não tinham foto. Depois, por solicitação do usuário, seis imagens ilustrativas geradas por IA foram vinculadas aos produtos; veja docs/IMAGENS-PRODUTOS.md. O seed continua preservando registros existentes, inclusive essas fotos. Esses registros são para testar a aplicação, e não para prometer disponibilidade física.

O cadastro não ativa pagamentos. Na conferência desta etapa, o pagamento continua desativado, com provedor pendente e ambiente sandbox. Uma compra com cobrança real depende de implementar/configurar e validar o provedor acordado; ver `docs/pendencias-publicacao.md`. Não foi executada compra ou cobrança pelo script.
