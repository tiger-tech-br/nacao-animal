# Continuidade — desenvolvimento local e celular — 21/10/2026

Este registro complementa a etapa 05. O usuário pediu continuar localmente enquanto o Railway está com novas publicações pausadas e, depois, continuar construindo novas páginas. Os avisos antigos de encerramento não cancelam esses pedidos posteriores.

## Servidor preservado

- Computador: http://localhost:4600/.
- Celular na mesma rede Wi-Fi: http://192.168.0.9:4600/. IP encontrado nesta sessão; pode mudar pelo DHCP.
- O servidor existente usa `npm run dev`, escuta `0.0.0.0` e foi mantido em execução. Não iniciar duplicatas nem encerrar outros processos.
- Usuário confirmou que o site passou a funcionar no celular depois da correção de HTTP. Sem inspeção visual automatizada: o bloqueio anterior do navegador continua válido; não contornar por outra ferramenta.

## Acesso pela rede local

`middlewares/securityMiddleware.js` deixa de enviar `upgrade-insecure-requests` em desenvolvimento: essa diretiva estava forçando CSS/JS para HTTPS ao abrir pelo IP, embora o servidor local use HTTP. Produção mantém a diretiva.

A exceção de origem local só vale fora de produção: HTTP, Origin igual ao Host e à porta do socket, hostname loopback ou IP de uma interface da própria máquina. Não libera qualquer IP da rede nem domínio arbitrário. Origens explicitamente configuradas continuam permitidas. `.env` não foi modificado.

## Páginas novas e navegação

- `/favoritos`: `views/products/favorites.html`, reutiliza `category-detail.js`. Busca, ordenação, remoção e adicionar ao carrinho; quantidades existentes preservadas, preço inválido/esgotado bloqueados. Diferencia vazio, produtos indisponíveis e erro da API; atualiza após logout, mudanças no carrinho e retorno pelo histórico. Favoritos continuam no `sessionStorage`, durante esta sessão; não anunciar sincronização permanente entre contas ou dispositivos.
- `/servicos`: `views/services/index.html`, CSS próprio. Apresenta somente Dog Walker e Pet Sitter já autorizados, com contato de Thiago Turquetti e links para os detalhes. Não restaura módulos clínicos ou agendamento antigo.
- Menu Serviços abre `/servicos`; Meus favoritos abre `/favoritos`, inclusive na home. O endereço antigo `/?favoritos=1#products` ainda abre o painel legado.
- Detalhe do serviço ganhou âncoras `#dog-walker` e `#pet-sitter`; banner e contato existentes preservados. WhatsApp do serviço: (11) 91571-2903. WhatsApp da loja: (11) 99271-2903. Não confundir os dois.

## Ajustes pedidos no celular

- Links do menu centralizados, incluindo avatar/login, usuário, Sair e favoritos.
- Abertura/fechamento com deslize e revelação vertical de 280 ms, respeitando movimento reduzido; altura limitada à tela e rolagem para celulares baixos.
- Fecha ao escolher um link, tocar fora ou usar Escape; Escape restaura foco no botão. Pesquisa e menu continuam exclusivos.
- Favoritos no menu da home sem borda apertada, consistente com os outros links.
- Rodapé responsivo da inicial: Nossa loja à esquerda; Minha conta/Meus favoritos à direita e Fale com a gente logo abaixo na mesma coluna direita.
- Crédito “Desenvolvido por Tiger Tech” removido da inicial e do acompanhamento público. Copyright da Nação Animal preservado.

## CEP, conta e favoritos existentes

- CEP de cadastro/Minha conta usa `/api/public/frete/cep/:cep`, com fallback do servidor, cancelamento/timeout e proteção contra resposta atrasada. Mantém número, complemento, edições manuais e foco; status acessíveis.
- Falha temporária ao carregar Minha conta preserva sessão, carrinho e favoritos. Oferece Tentar novamente e bloqueia ações do formulário enquanto o perfil não carregar. Somente 401/403 encerram a sessão; token de sessão anterior não preenche a conta atual.
- Painel legado de favoritos corrigido: não reduz a quantidade no carrinho a 1, não adiciona produto inexistente/esgotado/sem preço e mostra Sem foto no lugar da imagem incorreta de ração.

## Área administrativa

Entrada já existente: `/admin/` (também funciona pelo IP local). Dashboard: `/admin/pages/dashboard/dashboard.html`, com autenticação da equipe pelo fluxo existente. Essa base comercial já contém produtos, estoque, pedidos, clientes e demais módulos; não foi redesenhada nem autenticada nesta etapa. O usuário demonstrou interesse em vê-la. Não inventar métricas, credenciais, vendas ou uma nova identidade visual sem conferir a base atual.

## Verificações e preservação

- Suíte padrão: **245 testes; 241 aprovados, 0 falhas e 4 ignorados**. Os quatro de integração PostgreSQL condicionados a `RUN_DB_TESTS` não foram executados nesta etapa. Não confundir com a rodada anterior de 212 testes com PostgreSQL.
- Links estáticos aprovados em **40 páginas HTML**. Rotas novas, home e entrada administrativa responderam HTTP 200. API sem autenticação permanece protegida nas rotas administrativas.
- Sem novas migrações, alterações no banco real, compras, cobranças, cadastros ou envio real de e-mail. Pagamentos continuam desativados, provider pending, sandbox.
- Sem commit, push ou deploy nesta rodada. Migração 117 já aplicada permanece intacta.
- Caches: home-layout.css `20261021-4`, storefront-theme.css `20261021-1`, public-header.js `20261021-3`, public-auth.js `20261021-1`, category-detail.js `20261021-2`, home/catalog.js `20261021-2`, menu.js e home/layout.js `20261021-1`.

## Publicação ainda pendente

Railway: projeto/serviço devem se chamar `nacao-animal`, conforme pedido. A criação anterior foi recusada por “Deploys have been paused temporarily”. Nenhum destino novo ou domínio foi criado e nenhuma das 42 variáveis do `.env` real foi importada. Não modificar projetos existentes presumindo que sejam o destino. Usuário já paga Hobby de US$ 5; só pesquisou Render e Azure, sem autorizar migração para eles. Importação privada das variáveis para o destino correto já está autorizada; adaptar URLs/conexão do banco para o ambiente remoto, sem copiar localhost ou imprimir segredos.

Mapas/GPS e Google Cloud continuam conforme registro 05. Acesso HTTP pelo IP no celular não equivale à validação de mapa/GPS/HTTPS em produção. Não imprimir chaves, tokens ou `.env`.
