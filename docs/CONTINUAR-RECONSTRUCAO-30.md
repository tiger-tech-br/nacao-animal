# Continuidade — Link de localização no Google Maps — 25/10/2026

## Decisão do usuário

O usuário quer acompanhar a localização ao vivo, com Google Maps responsável pela navegação. Aceitou expressamente o passo manual: o entregador ativa o compartilhamento no aplicativo Maps, copia o link e o cola na página da entrega. Não desenvolver app Android nem retomar GPS/navegação próprios. Não prometer ativação automática de Iniciar ou de Compartilhamento de localização dentro do aplicativo externo.

## Fluxo aprovado

- O link privado do entregador continua mostrando o endereço congelado do pedido e **Navegar no Google Maps**.
- Na mesma página, o entregador informa o link de localização obtido no Google Maps e compartilha com a loja e o cliente.
- Administrador e cliente recebem notificação vinculada ao pedido; o cliente também recebe tentativa de e-mail.
- O e-mail aponta somente para `/acompanhar-entrega?pedido=UUID`. O cliente entra na conta da compra. Nenhuma URL privada do Google Maps, credencial do entregador ou coordenada deve ir no e-mail ou no texto da notificação.
- O acompanhamento autenticado oferece **Acompanhar localização no Google Maps** para link ativo do pedido em **Saiu para entrega**. A localização aparece externamente no Google Maps, sem mapa interno ou simulação.
- O acesso no site expira em até 24 horas e deixa de ser oferecido ao finalizar/cancelar a entrega. Ocultar o acesso no site não revoga um link já copiado; o entregador precisa parar o compartilhamento no aplicativo Google Maps.
- Não afirmar que validar o formato do link confirma transmissão de GPS, link ativo, avanço ou chegada. O Maps informa a disponibilidade real.

## E-mail e administração

`services/emailService.js` exporta `deliveryLocationSharedTemplate({ name, orderId })`, com URL interna autenticada e conteúdo escapado. `public/js/pages/admin/admin-page.js` mantém o fluxo simples da loja, com um carro e sem cadastro de entregadores; a seção **Rota da entrega** explica como disponibilizar a localização e leva a **Acompanhar entrega**.

`tests/email.test.js` verifica o endereço interno, a ausência do link privado do Maps e o escape de conteúdo. `RUN_DB_TESTS=1 npm test`: **717 testes aprovados, zero falhas e zero ignorados**, incluindo integração PostgreSQL em schema descartável. As 42 páginas passaram na verificação de links; `git diff --check` e a revisão final também passaram. A migração aditiva `120_localizacao_compartilhada.sql` foi aplicada no banco local. O deploy usa a migração normal do Railway e deve ter seu resultado conferido antes de afirmar que esta funcionalidade está no ar. Abertura do aplicativo e localização física continuam dependendo de conferência no celular.

## Implementação

`services/deliveryLocationShareService.js` persiste o link por pedido, faz autorização pelo token privado da entrega em andamento e grava os sinos na mesma transação. O mesmo link não duplica avisos; uma reserva de envio e a chave idempotente do provedor permitem repetir e-mail com falha sem duplicar o sino. O link privado não entra nas mensagens nem no e-mail. A validação de formato é compartilhada pelo servidor e navegador em `location-share-link.js`, sem consultar endereços externos. URLs óbvias de rota/lugar são recusadas, mas um link curto só pode ter a disponibilidade real confirmada pelo próprio Maps.

## Preservar

Não alterar `.env`, credenciais, pagamentos ou dados comerciais para demonstrar a funcionalidade. Não criar pedidos nem enviar mensagens de teste a clientes reais sem autorização. A orientação operacional atual está em `docs/GPS-ENTREGAS.md`.
