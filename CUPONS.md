# Cupons e sacola lateral

A sacola abre em um painel à direita ao clicar no ícone da sacola na loja. No celular, o painel ocupa a largura disponível. É possível fechar pelo X, pela tecla Escape, pelo fundo ou por **Escolher mais produtos**. A página `/sacola` continua acessível diretamente.

O painel permite ajustar quantidades, remover produtos, consultar o endereço, calcular o frete, escolher um cupom ou digitar um código. O resumo mostra produtos, desconto, subtotal após desconto, frete, total e economia. Um cupom por pedido; desconto somente nos produtos.

## PETFLOW10

A migração `database/sql/108_cupons.sql` cadastra **PETFLOW10**, com **10% de desconto**, ativo e visível na lista. Como não foram solicitadas outras restrições, ele não tem compra mínima, data final nem limite de utilizações. Não é exclusivo da primeira compra. O cadastro preserva alterações posteriores quando a migração é reaplicada.

Publique o código e aplique as migrações no banco da aplicação. O projeto usa `npm run db:migrate`; esse comando segue a conexão configurada no ambiente. Para aplicar apenas esta mudança no pgAdmin, abra o arquivo `108_cupons.sql` no banco usado pelo site e execute-o inteiro. Nunca execute testes de integração contra produção.

## Gerenciar no pgAdmin

Consultar:

```sql
SELECT codigo, descricao, tipo, valor, minimo_compra, desconto_maximo,
       inicia_em, expira_em, ativo, publico
FROM cupons WHERE empresa_id = get_petflow_empresa_id()
ORDER BY codigo;
```

Desativar a promoção:

```sql
UPDATE cupons SET ativo = FALSE
WHERE empresa_id = get_petflow_empresa_id() AND codigo = 'PETFLOW10';
```

Definir compra mínima e validade (edite os valores antes de executar):

```sql
UPDATE cupons
SET minimo_compra = 50.00, expira_em = '2026-12-31 23:59:59-03'
WHERE empresa_id = get_petflow_empresa_id() AND codigo = 'PETFLOW10';
```

Cadastrar outro cupom, inicialmente inativo para revisão:

```sql
INSERT INTO cupons
    (empresa_id, codigo, descricao, tipo, valor, minimo_compra, ativo, publico)
VALUES
    (get_petflow_empresa_id(), 'NOVOCUPOM', 'R$ 5 de desconto em produtos',
     'FIXO', 5.00, 50.00, FALSE, TRUE);
-- Depois de conferir os valores, altere ativo para TRUE para disponibilizá-lo.
```

`PERCENTUAL` aceita até 100%; `FIXO` representa reais. `desconto_maximo` limita o desconto em reais. `publico = FALSE` oculta da lista, mas permite aplicar pelo código. O desconto nunca ultrapassa o valor dos produtos; um pedido com total zero não segue para o pagamento online.

## Validação

O servidor ignora descontos e preços enviados pelo navegador, consulta os preços reais e revalida o cupom dentro da transação de criação do pedido. Código e desconto ficam salvos no pedido; mudar uma promoção não recalcula pedidos já criados. O PagBank recebe o desconto salvo em centavos, separado do frete.

O cálculo do frete continua dependendo de `GOOGLE_MAPS_API_KEY` com Routes API habilitada. Cupons não removem essa dependência.

## Entrega sem cadastro

Visitantes podem buscar o endereço pelo CEP, informar número/complemento e consultar o frete. Rua, bairro, cidade e UF também podem ser preenchidos manualmente se a consulta de CEP estiver indisponível. O endereço fica nesta sessão do navegador, para continuar após entrar na conta. A compra exige login, mas a cotação não.

Para clientes logados, a entrega é calculada automaticamente ao abrir a sacola com endereço completo e após editar o endereço. O botão de cálculo aparece somente para visitantes. Alterações durante a digitação são agrupadas para evitar consultas a cada tecla; uma falha temporária permite uma repetição automática. Uma cotação expirada é atualizada antes de pedir nova confirmação da compra.

O frete e o total completo só aparecem após uma cotação válida. Alterar o endereço invalida a cotação anterior. O servidor assina a cotação e verifica o endereço no momento da compra; o pedido e o PagBank usam esse endereço, mesmo que seja diferente do perfil.

### Configuração do Google Maps

Em 01/10/2026 a ausência da variável foi corrigida: `GOOGLE_MAPS_API_KEY` está cadastrada no Railway e no `.env`. O código também aceita `GOOGLE_API_KEY` como alternativa. Após ativar a Routes API, o teste real completo pelo código local passou: consulta do CEP `09060-700`, número `123`, rota de `1.094 metros` e frete de `R$ 3,00`, com cotação assinada. O erro inicial `403 SERVICE_DISABLED` deixou de ocorrer após a ativação ser reconhecida pelo Google. Nenhum pedido ou pagamento foi criado nesse teste.

Abra [Routes API no Google Cloud](https://console.cloud.google.com/apis/library/routes.googleapis.com), selecione o mesmo projeto da chave e clique em **Ativar**. Se aparecer **Gerenciar**, a API já está ativa nesse projeto. Em **APIs e serviços → Credenciais → sua chave**, inclua Routes API nas restrições de API, se houver. O projeto também precisa de faturamento habilitado. A chamada parte do servidor, não do navegador. Uma chave restrita a referenciadores de sites não serve para essa chamada. Depois publique/reinicie a aplicação e valide a cotação. O código não inventa distância nem apresenta frete grátis quando o provedor está indisponível.

Validação desta revisão: 28 testes aprovados, sem falhas ou testes ignorados, incluindo PostgreSQL temporário isolado, cupons, CEP, frete anônimo e valores enviados ao PagBank simulado. A validação visual em navegador não foi possível porque não havia navegador disponível na sessão. As mudanças de código ainda precisam ser publicadas; a configuração de variáveis no Railway não publica os arquivos locais.

Referências: [configuração da Routes API](https://developers.google.com/maps/documentation/routes/get-api-key) e [consulta de CEP](https://viacep.com.br/).
