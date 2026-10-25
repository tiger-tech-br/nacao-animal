# Continuidade — conclusão de entrega e notificações — 25/10/2026

O usuário aprovou **Concluir entrega** na página privada do entregador. A confirmação altera o mesmo pedido para **ENTREGUE** no painel e no acompanhamento público, cria um aviso no sino do administrador e usa o trigger existente para avisar o cliente. O e-mail usa o modelo de pedido entregue já existente e depende do provedor configurado.

## Funcionamento implementado

- Botão com confirmação acessível e responsiva. Abrir o Maps, chegar ao destino ou ocultar a página não conclui a entrega.
- `POST /api/public/entregas/concluir` exige o Bearer privado de 64 caracteres hexadecimais e somente `{ "confirmar": true }`. O pedido precisa estar em **SAIU_PARA_ENTREGA**, com link ativo e não substituído.
- Migração aditiva **122_conclusao_entrega.sql** guarda recibo mínimo com hash do token, data da conclusão, validade original do link e reserva de envio do e-mail. Não guarda endereço, GPS ou token em texto aberto. Não modifica pagamentos, estoque ou financeiro.
- Transação bloqueia o pedido, registra ENTREGUE e auditoria, dispara o aviso do cliente, insere o aviso do administrador e encerra rastreamento/compartilhamento. Confirmações simultâneas ou repetidas não duplicam a transição nem os sinos.
- Após concluir, o mesmo link só permite consultar o recibo mínimo até sua validade original. O endereço e a localização deixam de ser oferecidos. Repetir o POST reconhece a conclusão anterior. O e-mail possui reserva e chave de idempotência; em caso de falha, há botão explícito para tentar enviar o aviso novamente, sem concluir ou notificar outra vez.
- Acompanhamento público/admin e sinos consultam a cada 15 segundos enquanto visíveis. Os detalhes de um pedido em rota no painel também consultam a cada 15 segundos; não substituem alterações de status em edição, controles ocupados ou respostas de uma seleção antiga. O botão Atualizar também recarrega os detalhes seguros.
- Concluir no site não revoga o compartilhamento externo do Google Maps. O entregador deve encerrá-lo no aplicativo.

## Navegação e notificações

- **Sair** tem a mesma fonte dos outros links, laranja e sublinhado somente em hover/foco, com mais afastamento (28px desktop, 16px acima no menu móvel).
- Painel de notificações redesenhado no público e no admin: títulos/mensagens/links quebram linhas, cabeçalho e ações ficam fixos dentro do painel e somente a lista rola. Largura considera a barra de rolagem para respeitar as margens em 320/390px.
- Abrir o sino marca apenas os IDs exibidos como lidos nos dois painéis. Contador some depois de a API confirmar. Corrigida a comparação incorreta entre JWT e identidade da sessão pública. Troca/renovação de conta e respostas atrasadas são protegidas. Falha de gravação conserva o contador e oferece nova tentativa.
- Caches de JS/CSS versionados nas páginas afetadas.

## Conferência e publicação

Testes automatizados incluem concorrência real em PostgreSQL isolado, rejeições de tokens/status/corpos, reenvio de e-mail com provedor simulado, sinos, descarte de respostas antigas e confirmação acessível. Conferência visual feita em servidor local de prévia com dados fictícios e sem banco/e-mails reais, incluindo público em 390px e admin em 320px. Não usar esse servidor de prévia como site da loja.

Suíte completa: **708 testes aprovados, zero falhas e zero ignorados**, com `RUN_DB_TESTS=1`. Links das **40 páginas** aprovados. A migração122 foi aplicada no localhost. Antes de afirmar que está publicado, conferir GitHub verify e Railway SUCCESS para o commit desta atualização. O processo normal de pre-deploy aplica a migração122. O pedido fictício da atualização31 não foi concluído nem duplicado para testar a interface.

Preservar `.env`, credenciais e contas, produtos Répteis/Jardinagem e pagamentos desativados. Google Maps externo e compartilhamento manual continuam; não restaurar simuladores antigos. Railway é demonstração, futura produção prevista na Vixpi.
