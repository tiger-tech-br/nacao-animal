# Continuidade — Google Maps e status — 25/10/2026

## Decisão do usuário

Após testar a navegação própria e relatar lentidão, o usuário aprovou expressamente: **Google Maps para navegar e status do pedido no site**. Não continuar tentando igualar a navegação interna ao aplicativo. Um eventual app Android com localização em segundo plano é uma etapa futura, sem desenvolvimento autorizado nesta tarefa.

## Alteração

- `/entregador`: consulta o link privado existente e exibe endereço congelado no pedido + **Navegar no Google Maps**, perfil de carro. Não captura/publica GPS nem carrega os módulos de mapa, voz, manobras ou alternativas.
- `/acompanhar-entrega` e `/admin/acompanhar-entrega`: status e endereço, sem mapa, localização ou previsão. Atualização a cada 15 segundos enquanto visível e botão manual. Mantidas autenticação por pedido/empresa, sincronização de sessão pública e proteção contra respostas tardias após logout, troca de conta ou ocultação.
- Painel: **Rota da entrega**, geração e compartilhamento do link privado existentes. O responsável marca **Entregue** após concluir; Maps não altera o status automaticamente.
- Textos de Meus pedidos/e-mail foram alinhados a **Acompanhar pedido**, sem promessa de mapa ao vivo.
- Fluxos existentes, banco, frete, pagamentos, configuração e processos abertos preservados. Nenhum commit, push ou deploy realizado nesta etapa.
- Documentação operacional atual: `docs/GPS-ENTREGAS.md`. Os módulos legados e diagnósticos continuam no repositório, fora das telas atuais.

## Verificação

90 testes direcionados aprovados: link oficial com endereço correto e sem credencial privada; link inválido/expirado; endereço incompleto; rede; retorno do Maps/BFCache; status reais; autenticação, troca/renovação de sessão e descarte de respostas antigas. Cinco verificações complementares de URL/codificação, complemento, tipos e requisição duplicada também aprovadas.

`RUN_DB_TESTS=1 npm test`: **691 testes aprovados, zero falhas e zero ignorados**, incluindo integrações com banco em schemas descartáveis. `npm run test:links`: 42 páginas aprovadas. Sintaxe dos scripts alterados e `git diff --check` aprovados. Conferência HTTP no servidor local: `/entregador`, `/acompanhar-entrega` e `/admin/acompanhar-entrega` retornam 200 com as telas novas, sem carregar os scripts de mapa/navegação. Não houve criação de clientes, pedidos, cobranças ou envio de e-mails comerciais para esta conferência. Os sete testes de notificações também passaram após alinhar o sino a **Acompanhar pedido** e corrigir a descrição legada para acompanhamento de status.

Abertura do aplicativo Google Maps e aparência final no celular ainda precisam de conferência em aparelho. Não afirmar que a navegação física foi testada por testes de URL. Usar pedido autorizado existente, sem criar cobranças ou dados comerciais apenas para teste.

Leia `git status` e preserve mudanças presentes. Sem commit/push/deploy sem pedido. Não exibir `.env` ou credenciais. Para retomar o projeto, este registro substitui as instruções de navegação própria dos documentos anteriores; os demais requisitos continuam válidos.
