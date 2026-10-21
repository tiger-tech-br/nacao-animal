# Continuidade — filtros e acompanhamento de pedidos — 21/10/2026

Leia este registro antes do 07 e do 06. O usuário autorizou continuar o projeto local e pediu o próximo passo. Esta rodada melhora o gerenciamento dos pedidos existentes e corrige os estados finais no acompanhamento do cliente.

## Implementado

- A página `admin/pages/vendas/vendas.html` tem seleção de status, data inicial/final e limpeza de todos os filtros, incluindo a busca. Combina todos os critérios sem alterar os registros recebidos da API.
- Os quatro cartões de etapas são botões de filtro, com seleção visível, `aria-pressed` e operação por teclado. Clicar novamente limpa o status. Os contadores dos cartões continuam representando todos os pedidos carregados, conforme o aviso junto aos filtros.
- Busca e filtros reiniciam a primeira página. A exportação CSV usa todos os resultados filtrados, incluindo as páginas seguintes, mantendo a proteção existente contra fórmulas de planilha.
- Períodos incluem as duas datas e usam o horário de São Paulo. Datas literais válidas não mudam de dia; timestamps precisam informar o fuso. Intervalos invertidos exibem orientação e bloqueiam a exportação até a correção. Datas inválidas não excluem registros quando não há filtro de período.
- Consultas de detalhes descartam respostas antigas: selecionar B depois de A ou fechar o painel impede que a consulta anterior sobrescreva a seleção atual. O indicador de carregamento também respeita a consulta atual. Atualizar um status não reabre outro pedido já selecionado.
- Na página do cliente, `FINALIZADA` conclui todas as etapas. `CANCELADA` exibe encerramento, sem apresentar entregas futuras. Status desconhecido informa indisponibilidade, sem inventar progresso. Pagamento e atendimento existentes foram preservados.

## Arquivos principais e caches

- `public/js/pages/admin/order-filters.js`: helper browser/CommonJS, sem dependências externas.
- `public/js/pages/admin/admin-page.js`: integração dos filtros, CSV, datas e proteção de consultas de detalhes. Referências atualizadas nas páginas administrativas para `v=20261021-1`.
- `public/css/pages/admin-orders.css`: estilos somente para `body.admin-brand.admin-orders-page`; responsivo em duas colunas abaixo de 1100px e uma abaixo de 720px. Importado após o tema administrativo.
- `public/js/pages/admin/config/vendas-page.js`: cartão Entregue agora diz “Entrega confirmada”, sem afirmar que os dados são somente de hoje. Cache `v=20261021-1`.
- `public/js/pages/auth/public-auth.js`: cache `v=20261021-2` nas páginas de autenticação/conta/pedidos.
- `public/css/pages/auth-storefront.css`: cache `v=20261021-1` nas páginas correspondentes.

Não alterar o arquivo legado `public/js/pages/vendas/vendas.js` para esta tela: a implementação atual usa `admin-page.js` e a configuração administrativa.

## Verificação

- Suíte padrão: **284 testes, 280 aprovados, 0 falhas e 4 integrações PostgreSQL ignoradas**. Não executada novamente com `RUN_DB_TESTS=1`.
- Novos testes: `admin-order-filters.test.js` (10), `admin-orders-ui.test.js` (16) e `order-timeline-ui.test.js` (9). Os testes de UI executam o código real em VM com DOM/API simulados; não usam contas, pedidos ou serviços reais.
- Cobertos filtros combinados, exportação de várias páginas, paginação, intervalo inválido/recuperação, virada do dia em Brasília com dispositivos em outros fusos, sucesso/falha fora de ordem e fechamento de detalhes durante consulta.
- Referências estáticas aprovadas em 40 páginas HTML. HTML de pedidos e CSS novos/alterados aceitos pelo parser; sintaxe JavaScript e whitespace conferidos.
- Revisão independente dos filtros e integração não encontrou falhas funcionais concretas.
- HTTP 200 na home, `/admin/`, painel de pedidos, `/meus-pedidos` e novos scripts/estilos. Isso confirma acesso aos documentos, não um teste visual autenticado.

## Servidor e limites desta rodada

Servidor local preservado na sessão **72527**, porta **4600**, iniciado por `npm run dev` com acesso externo. Não iniciar duplicata nem encerrar ao terminar. Local: http://localhost:4600/ . Celular na mesma rede: http://192.168.0.9:4600/ (IP pode mudar).

Inspeção visual do navegador permanece bloqueada. Não contornar com outra ferramenta nem afirmar QA visual autenticado. Não houve login, alteração real de pedido, cadastro, cobrança, envio de e-mail, migração, mudança no `.env`, commit, push ou deploy nesta rodada.

## Hospedagem

Usuário continua pesquisando provedores, agora também AWS, HostGator e Netlify; isso não autoriza migrar, contratar ou criar recursos. Na AWS foram apresentados Elastic Beanstalk/Node.js e RDS/PostgreSQL. Na HostGator, VPS é compatível; hospedagem compartilhada não oferece Node/PostgreSQL para esta aplicação. EasyPanel permite GitHub, Node e PostgreSQL; configuração, atualizações e backups ainda precisam ser mantidos. Não tratar preços promocionais equivalentes por mês como mensalidade sem compromisso.

Netlify: a documentação atual oferece Express por Functions e PostgreSQL pelo Netlify Database. Exige adaptar rotas/execução e a rotina contínua de liberação de reservas de `server.js`; não basta publicar os arquivos estáticos. Planos consultados: Free US$ 0, Personal US$ 9 e Pro a partir de US$ 20/mês, com créditos de consumo. Fontes: https://www.netlify.com/pricing/ e https://docs.netlify.com/build/frameworks/framework-setup-guides/express/ . Para esta base, uma hospedagem com processo Node contínuo exige menos adaptação; isso é uma avaliação da arquitetura, não impossibilidade de usar Netlify.

Railway continua sendo a preferência anteriormente expressa, com nome exato `nacao-animal`. Ainda não existe destino confirmado nem importação das 42 variáveis; a criação estava bloqueada pela pausa de deploys do provedor. Não copiar variáveis locais de banco/APP_URL para um destino diferente sem adaptar a configuração. Pagamentos continuam desativados, provider pending, sandbox. As demais restrições e conquistas estão nos registros 07/06 e no prompt curto.

## Próximo trabalho

Aguardar a orientação seguinte, ou continuar uma etapa administrativa pequena e verificável. Não ampliar para ativação de pagamento ou publicação automaticamente. A base de pedidos agora tem filtros funcionais; preservar os status e as transições impostas pelo servidor, em especial a confirmação de pagamento pelo provedor.
