# Revisão do PetFlow v2 — 30/09/2026

> Documento histórico. As pendências abaixo refletem aquela revisão e algumas já foram corrigidas. Para instalação, critérios atuais e limites operacionais, consulte `docs/entrega-comercial.md` e `docs/revisao-comercial-2026-10-12.md`.

> Atualização posterior: o usuário confirmou que o PagBank já funciona. Foram implementados frete por rota Google Maps (1 km grátis; R$ 3 por km adicional ou fração), endereço congelado no pedido, cobrança do frete no PagBank e GPS opcional do entregador. A pendência de frete abaixo descreve a revisão inicial e foi substituída por essa implementação. Permanecem necessários configurar GOOGLE_MAPS_API_KEY e publicar o código; consulte README.MD. A suíte ampliada passou em 14 testes com PostgreSQL isolado e provedores simulados.

## Resultado e limites

Correções feitas no workspace, sem publicação no Railway. As alterações locais que já existiam foram preservadas. Esta revisão cobre os fluxos inspecionados; não representa garantia de ausência de outros erros.

`RUN_DB_TESTS=1 npm test`: 11 testes aprovados, nenhum ignorado. O teste de integração usou PostgreSQL local em schema isolado e simulou Resend e PagBank; não enviou emails nem movimentou pagamentos reais.

## Causa observada do problema de email

O Railway informa aplicação e PostgreSQL com deploy SUCCESS. No deploy `b3d8a1dd-0e86-4348-9fd3-df2e70edaf71`, o log de 30/09/2026 00:56:36 UTC (29/09, 21:56:36 em São Paulo) registra `RESEND_API_KEY não configurada no .env.` durante o cadastro, seguido de HTTP 500. Tentativas posteriores retornaram 409 no cadastro e 403 no login. Isso é compatível com conta persistida sem confirmação na versão publicada.

A configuração atual do serviço lista RESEND_API_KEY e EMAIL_FROM, mas o conector Railway não permite ler os valores. A existência do nome não confirma valor válido nem sua disponibilidade no deploy consultado. A chave local respondeu `401 restricted_api_key` à consulta de domínios: não permite inspeção de domínios, o que não comprova falha da permissão de envio. Não é possível afirmar que o domínio está verificado ou que houve entrega real.

### Correções desta revisão

- `services/emailService.js`: erros de rede, timeout, HTTP e resposta inválida retornam 503; logs distinguem chave, domínio, restrição de testes e limite do provedor, sem registrar chave, destinatário ou corpo da mensagem. Aceitação registra ID do Resend para rastreamento; aceitação não significa entrega.
- `config/env.js`: remove espaços externos da chave/remetente e barra final de APP_URL; usa RAILWAY_PUBLIC_DOMAIN quando APP_URL estiver ausente.
- `server.js`: alerta na inicialização quando a configuração de email estiver incompleta.
- `middlewares/errorMiddleware.js`: respeita statusCode usado pelas validações de pedidos, evitando HTTP 500 em erros de entrada.
- `public/css/base/main.css`: corrige import de dashboard-widgets que retornava 404 nos logs reais.
- `tests/email.test.js`: cobre aceitação, rejeições, timeout, rede, resposta inválida, email opcional e statusCode.

O workspace já continha rollback de cadastro quando o envio falha, reenvio de confirmação e ajustes em pagamentos/estoque. Essas mudanças foram preservadas e exercitadas pelo teste de integração existente.

## Pendências para produção, por prioridade

1. **Email e publicação:** no serviço petflow-v2 / production, conferir RESEND_API_KEY não vazia, EMAIL_FROM autorizado e APP_URL HTTPS público. Publicar o código revisado e as variáveis. Usar “Reenviar confirmação de e-mail” para as contas antigas bloqueadas, sem apagar clientes. Conferir o ID da mensagem no Resend e o evento de entrega. A documentação oficial explica as restrições de domínio/remetente: https://resend.com/changelog/improved-logs-visibility.
2. **Estoque reservado:** `services/vendaService.js` verifica disponibilidade ao criar pedido, mas a baixa ocorre na confirmação do pagamento. Pedidos concorrentes podem pagar pelo último item antes da baixa. Falta reserva com prazo e liberação por expiração/cancelamento.
3. **Cancelamento e estorno:** a atualização de status não implementa um fluxo completo de solicitação de reembolso no PagBank, reversão financeira e devolução de estoque conforme a situação da entrega. É necessário definir as regras e transições permitidas antes de automatizar.
4. **Frete e cobertura:** `services/pagseguroService.js` envia frete FIXED/PAC com amount 0. Falta regra comercial explícita de preço, área atendida e prazo, ou confirmação de que frete grátis é intencional.
5. **Confiabilidade dos emails:** pedidos e newsletter usam envio opcional sem fila persistente. Falta armazenar pendências, retentar falhas transitórias e acompanhar eventos delivered/bounced/failed. Uma falha ou reinício pode perder a notificação.
6. **Homologação externa:** validar PagBank real (checkout, assinatura de webhook, confirmação e cancelamento), remetente Resend e upload Cloudinary com a configuração de produção. A presença das variáveis não confirma credenciais válidas. Não houve cobrança ou envio real nesta revisão.
7. **Migrações e operação:** `scripts/migrate.js` reaplica todos os SQL em cada execução, sem histórico de versões. Falta controle de migrações aplicadas e validação em CI antes do deploy; Railway está com checkSuites=false. Confirmar backup e restauração do PostgreSQL; a existência de volume não comprova backup.

## Escopo já existente

Catálogo, sacola, conta de cliente, confirmação e recuperação de senha, pedidos, checkout PagBank, painel administrativo, produtos, categorias, clientes, fornecedores, compras, estoque, financeiro, newsletter e páginas de privacidade/termos. Agenda, serviços clínicos, pets e funcionários foram removidos intencionalmente nesta versão e não são pendências da loja de produtos.
