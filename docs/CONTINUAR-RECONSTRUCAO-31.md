# Continuidade — Pedido fictício, login e retirada dos simuladores — 25/10/2026

O usuário autorizou criar um pedido fictício na demonstração Railway, corrigir o card amarelo do login administrativo e remover as telas antigas de GPS próprio. Estas decisões complementam a atualização30.

## Pedido de demonstração criado

- Pedido: `0e8a7e6a-984a-45a1-8fc6-01afdca678c3`, na demonstração `nacao-animal-production.up.railway.app`.
- Cliente: **Cliente Fictício - Teste de Entrega**, conta exclusiva `cliente.entrega.teste@exemplo.invalid`. A senha de teste foi informada ao usuário e não fica no repositório.
- Status inicial: **SAIU_PARA_ENTREGA**. Total, frete e item zerados. Destino: endereço público da própria loja, Avenida Novo Horizonte256, Santo André.
- Marcador: `NA-DEMO-ENTREGA-20261025`. Não criar outro pedido igual ao retomar.
- A criação foi uma fixture SQL autorizada, fora do checkout e sem registro de pagamento, reserva, movimentação de estoque ou lançamento financeiro. Estoque e financeiro foram comparados antes/depois e permaneceram iguais. Nenhum e-mail foi enviado.
- Administração, login do cliente e acompanhamento autenticado foram conferidos no site. O pedido tem link de entregador ativo; gerar outro pelo painel invalida o anterior. Não reutilizar links antigos escritos no chat após nova geração.
- A conta fictícia permite testar o sino e a página pública; seu endereço reservado não recebe e-mails reais. Não substituir por dados pessoais nem enviar teste para cliente real sem pedido do usuário.

## Interface

O círculo atrás dos animais vinha de `.login-brand-art::before` e cobria parte do parágrafo. Foi removido. Texto recebeu espaçamento, contraste e camada própria; passou a aparecer também no celular. CSS versionado para limpar cache. Conferência visual local em desktop e390px concluída.

As páginas `/admin/testar-gps` e `/admin/simular-navegacao`, seus arquivos exclusivos e a API `/api/gps-diagnostico` foram retirados por pedido do usuário. Login não redireciona para os endereços antigos. Os componentes legados de navegação continuam cobertos por testes, com percursos em `tests/fixtures`, sem telas públicas de simulação. Google Maps, compartilhamento manual do link e status de pedidos permanecem.

## Validação

`RUN_DB_TESTS=1 npm test`: **663 testes aprovados, zero falhas e zero ignorados**. A redução decorre da retirada dos testes exclusivos das telas antigas; testes dos motores e do fluxo atual foram preservados. Links das40 páginas HTML aprovados. Endereços antigos retornam404 no localhost; login e saúde retornam200. Conferir resultado do deploy e versão remota antes de afirmar publicação.

Preservar `.env`, credenciais, dados comerciais e pagamentos desativados. Não retomar navegação própria. O usuário confirmou que quer testar usando o pedido fictício e compartilhar a localização pelo Google Maps; teste físico da navegação/compartilhamento ainda depende do celular.
