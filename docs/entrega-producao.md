# Entrega do PetFlow

## Antes do deploy

1. Execute `npm test`.
2. Execute `npm run release:check` com as mesmas variaveis do ambiente que sera publicado.
3. Crie um backup com `npm run db:backup`. O comando tambem valida se o arquivo pode ser lido pelo `pg_restore`.
4. Confirme que o Railway executou `npm run db:migrate` no pre-deploy.
5. Abra `/api/health` e `/api/readiness`; ambos devem responder HTTP 200.

## Teste de aceitacao

- Cadastre um novo cliente e confirme o e-mail.
- Calcule o frete logado e como visitante.
- Use o cupom `PETFLOW10` e confirme o desconto no pedido e no PagBank.
- Conclua uma compra de baixo valor e confira o webhook, a baixa de estoque e o financeiro.
- Altere o pedido para separacao e saida para entrega.
- Abra o link do entregador no celular, permita o GPS e acompanhe como cliente e administrador.
- Finalize a entrega e confirme que o compartilhamento de GPS parou.
- Crie um produto com foto e confirme o card na loja.
- Exporte os dados em Minha conta e registre uma solicitacao LGPD.
- Cancele um pedido de teste pago e confirme o estorno no PagBank antes de testar em pedido real.
- Na area Meus pedidos, abra uma solicitacao de cancelamento e confirme o protocolo, o sino administrativo e a resposta ao cliente.
- Simule uma entrega com GPS: nas primeiras 24 horas, confirme cancelamento acima de 1 km do destino e bloqueio quando estiver mais perto; depois de 24 horas, confirme que o sistema abre atendimento sem estorno automatico.

## Backup e restauracao

As ferramentas cliente do PostgreSQL (`pg_dump` e `pg_restore`) precisam estar instaladas e disponiveis no PATH.

```powershell
npm run db:backup
npm run db:restore -- --file=backups/petflow_v2_AAAA-MM-DD_HH-MM-SS.dump --confirm=petflow_v2
npm run db:migrate
```

A restauracao apaga e recria objetos do banco de destino. Use uma instancia separada para o ensaio e mantenha pelo menos uma copia do backup fora do computador de desenvolvimento.

## Operacao diaria

- Verifique notificacoes, pedidos e solicitacoes LGPD no painel.
- Nao edite lancamentos financeiros automaticos; cancele pelo pedido ou pela compra de origem.
- Mantenha o endereco, telefone, e-mail e horario da loja atualizados em Configuracoes.
- Restrinja a chave publica do Google Maps ao dominio publicado e a chave privada ao IP/API quando aplicavel.
- Revise os backups e realize um ensaio de restauracao periodicamente.
