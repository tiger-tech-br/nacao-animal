# Prompt de continuidade — etapa 4

Este é o registro mais recente. Copie o bloco abaixo ou use PROMPT-CONTINUAR-CURTO.txt.

```text
Continue o site Nação Animal a partir do estado atual, sem refazer o aprovado.
Projeto: C:\Users\andre\Desktop\gemini-cursos\front-end\tiger-tech\projetos\nacao-animal.
Stack: Node/Express, HTML/CSS/JS, PostgreSQL local nacao-animal.
Iniciar: npm run dev; abrir http://localhost:4600/. Preserve processos já abertos.

VISUAL E PEDIDOS DO USUÁRIO
Referência: public/images/reference/layout-home.png, quarto layout amarelo/laranja com golden retriever e gato. Preserve inicial, logo e public/images/hero/nacao-animal-dog-cat.png.
Sem Blog no menu. Hover com texto laranja e sublinhado, sem quadrado branco, sombra ou elevação. O reset do li.menu-item evita o fundo do CSS administrativo herdado.
Avatar e “Entrar | Cadastrar” na navegação; é um link único para /login, com abas Entrar/Criar cadastro nessa página. A sessão altera só span[data-customer-label] para preservar SVG; autenticado mostra nome e Sair. Menu móvel até 992px em CSS/JS.
Removidos a pedido: Entrar do rodapé da inicial; parágrafo “Uma conta para acompanhar cada compra e deixar seus favoritos sempre por perto.” da lateral do login; botão repetido “Fale com o Thiago” no topo do serviço. Não recolocar.

PÁGINAS
Já adaptadas: inicial, categorias por pet, produto, sacola, login/cadastro, redefinição, conta, pedidos, privacidade, termos, cancelamento de newsletter e rastreamento público.
Novas e acessíveis: /sobre, /contato, /ajuda, /categorias. Rotas em app.js. Sobre e Contato do menu abrem as páginas próprias. A home mantém suas seções e mapa.
- views/institutional/{about,contact,help}.html
- public/css/pages/institutional-storefront.css
- public/js/pages/institutional/contact.js: dados reais de /api/public/loja, telefone/e-mail/mapa seguros, horários só quando válidos; mantém contatos conhecidos em falha.
- views/categories/index.html e public/css/pages/category-directory.css: vitrine das seis categorias.
FAQ informa o estado real dos pagamentos e não inventa prazos ou políticas. Textos legais existentes não foram alterados.

FOTOS DAS CATEGORIAS
Home, vitrine e cabeçalhos usam public/images/categories/{dogs,cats,birds,fish,rodents,accessories}-v2.jpg, fotos geradas em creme/amarelo sem texto/logo. JPEGs de 1200 × 800 otimizados, cerca de 500 KB somados. PNGs -v2.png originais e fotos antigas preservados. Não retornar às imagens antigas sem -v2.

CARROSSEL AUTOMÁTICO
Está na home entre benefícios e Produtos em Destaque, id home-promotions. Passa sozinho a cada 7 segundos com transição curta de opacidade. Botão de pausa REMOVIDO por pedido do usuário. Setas/indicadores opcionais; mouse sobre o banner e foco nos controles NÃO suspendem a rotação. Somente aba oculta ou foco no conteúdo de um slide suspendem, com retomada automática ao sair. Movimento reduzido remove só a transição visual, mantendo autoplay. Sem JS mostra primeiro banner.
Avisos: explorar categorias; futuros cupons/newsletter; Dog Walker/Pet Sitter. O slide do serviço usa o MESMO banner original public/images/services/dog-walker-pet-sitter.png, inteiro com object-fit:contain, em vez da foto da categoria cães. Nenhum cupom/desconto falso foi criado. Só anunciar códigos e descontos realmente cadastrados e válidos.
Arquivos: HTML em views/home/index.html; public/css/pages/home-promo-carousel.css; public/js/pages/home/promo-carousel.js; tests/home-promo-carousel.test.js.
A vitrine de produtos existente continua com navegação manual e dados reais da API; não confundir os dois carrosséis.

SERVIÇO
/servicos/dog-walker-pet-sitter, view/CSS próprios e banner original inteiro public/images/services/dog-walker-pet-sitter.png. Contato: Thiago Turquetti, (11) 91571-2903, Sacadura Cabral — Santo André. Mantém Conversar no WhatsApp. Página estática autorizada, sem restaurar tabelas/APIs clínicas.

PRODUTOS DE TESTE JÁ GRAVADOS
O usuário autorizou expressamente produtos aleatórios de R$ 6/R$ 10 para futuros testes, inclusive compras com cobrança real; isso é exceção à preferência anterior contra produtos inventados.
Foram cadastrados LOCALMENTE seis produtos ativos, cinco unidades cada, nomes [TESTE] e SKUs NA-TESTE-*:
Cães: saquinhos higiênicos R$ 6; Gatos: varinha R$ 6; Aves: poleiro R$ 6; Peixes: enfeite de aquário R$ 10; Roedores: mordedor hamster R$ 6; Acessórios: bolinha pets R$ 10.
Dados sintéticos identificados, sem promessa de mercadoria física confirmada. Sem marcas ou avaliações inventadas. Em seguida o usuário pediu imagens para todos: seis ilustrações geradas por IA já estão vinculadas no banco. Consulte docs/IMAGENS-PRODUTOS.md para mapeamento de SKUs, arquivos e prompts.
scripts/seed-test-products.js: prévia padrão sem banco; --apply grava em transação, valida banco/empresa e registra estoque/movimentação/auditoria. Já executado; reexecução conferida, preserva seis registros sem duplicar nem repor estoque. Não precisa executar de novo. Não mudar para resetar estoque/preços após compras. Guia docs/CATALOGO-TESTES.md.
Nenhum cliente, pedido, cobrança, e-mail ou cancelamento real foi executado para testar.

PAGAMENTO E REGRAS
Última conferência: PAYMENTS_ENABLED=false; PAYMENT_PROVIDER=pending; PAYMENT_ENVIRONMENT=sandbox. Não ativamos cobranças. Catálogo/sacola prontos para testes; cobrança real depende de integrar/configurar/validar o provedor acordado. Não ativar credencial/adaptador herdado para aparentar conclusão.
Preserve IDs/forms, autenticação, estoque, favoritos, frete, cupons, checkout, notificações e contratos. Não alterar textos legais nem restaurar módulos clínicos. Sem commit/push/deploy sem pedido. Não imprimir .env ou segredos.

ARQUITETURA
Home: views/home/index.html, home-layout.css?v=20261020-5, catalog.js?v=20261020-3, layout.js.
Internas: body.storefront-page; public-header.js?v=20261020-3 injetado; storefront-theme.css?v=20261020-4. Categoria: category-detail.js?v=20261020-2. Carrossel CSS/JS v20261020-2.
Rastreamento público em views/delivery/public-tracking.html; administrativo/entregador separados e preservados.
Busca aceita /?busca=...#products e /#products?busca=...; /?favoritos=1#products abre favoritos após carregar catálogo. Lupa/menu se fecham mutuamente.

VERIFICAÇÃO E CONTINUIDADE
97 testes pertinentes aprovados (autoplay com relógio simulado, contato/API, seed/rollback/idempotência, UI, sessão, estoque, sacola/frete/cupons, pagamentos isolados, entrega e e-mails simulados). npm run test:links aprovou 37 páginas. Sintaxe JS, IDs únicos e git diff --check conferidos. API local confirmou seis produtos, preços de 6/10 e estoque total de 30; quatro rotas novas HTTP 200. Isso não prova aparência visual.
Inspeção do navegador bloqueada anteriormente por política de URL/protocolo: não contornar com CDP, outra superfície ou ferramenta. Quando houver acesso legítimo, revisar desktop/mobile, recortes, altura de banners, autoplay, login e sacola. Corrigir problemas observados, preservando o aprovado.
Leia git status/diff e preserve mudanças/commits do usuário. Há trabalho não commitado.
Se o novo chat não tiver acesso à pasta, pedir apenas arquivos necessários e fornecer alterações para aplicação manual; não fingir acessar localhost nem editar o computador. Os arquivos permanecem no computador. Se o servidor parar, abrir terminal na pasta e executar npm run dev.
```

Registro de 20/10/2026. Históricos: CONTINUAR-RECONSTRUCAO.md, -02 e -03.

Ajuste posterior de 20/10: lateral do carrinho agora mostra ‘Meu carrinho’ e ‘Seu carrinho está vazio.’. Fechar/iframe também usam carrinho; rota /sacola e checkout foram preservados. cart-sidebar.js e cart.js usam v20261020-1. Após ajustes de autoplay, banner e textos passaram 29 testes pertinentes e links de 37 páginas. Rotação foi testada com relógio simulado, inclusive sem toggle, com hover, foco em controles, reduced-motion e script defer; revisão visual continua pendente.

PONTO FINAL DA ETAPA: usuário pediu parar no Codex após concluir imagens e continuar no chat gratuito. As seis imagens foram geradas, inspecionadas, otimizadas para JPEG 900x900 e vinculadas aos produtos. PNGs originais 1254x1254 preservados. Preços/custos/status/estoques intactos e auditoria registrada; descrições informam imagem ilustrativa de IA. Oito páginas e seis fotos HTTP 200. Site local permanece funcionando; não iniciar trabalho adicional automaticamente. Nenhuma compra ou cobrança foi realizada. Leia docs/IMAGENS-PRODUTOS.md. Para continuar sem ferramentas locais, pedir somente os arquivos necessários e orientar aplicação manual.
