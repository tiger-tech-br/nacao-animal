# Prompt de continuidade — etapa 3

Estado mais recente: [CONTINUAR-RECONSTRUCAO-04.md](CONTINUAR-RECONSTRUCAO-04.md), com novas páginas, fotos, produtos de teste e carrossel automático.

Copie o bloco abaixo para continuar, mesmo em um chat sem o histórico anterior.

```text
Continue a reconstrução do site Nação Animal.

Projeto local: C:\Users\andre\Desktop\gemini-cursos\front-end\tiger-tech\projetos\nacao-animal.
Stack: Node/Express, HTML/CSS/JavaScript. Comando local: npm run dev; URL http://localhost:4600. Sem build obrigatório.

VISUAL APROVADO
Referência: public/images/reference/layout-home.png. É o QUARTO layout do painel de seis imagens, amarelo e laranja, originalmente no canto inferior esquerdo. Mantenha a identidade e as proporções. A inicial tem logo grande, título “O melhor para o seu pet, sempre!”, botão laranja, golden retriever e gato à direita, faixa de benefícios e vitrine creme. Asset separado com transparência: public/images/hero/nacao-animal-dog-cat.png. Logo: public/images/logo/nacao-animal-logo-transparent.png. Não substitua os animais ou o estilo por outra proposta.

PREFERÊNCIAS MAIS RECENTES
Menu: Início, Sobre, Produtos, Serviços, Contato e avatar com “Entrar | Cadastrar”. SEM Blog. O acesso à conta está na navegação em desktop e no menu móvel; “Entrar” foi removido do rodapé da inicial. A sessão atualiza somente span[data-customer-label] para preservar o SVG, e mostra primeiro nome e Sair quando autenticado. O usuário rejeitou o quadrado branco do hover. A causa foi o CSS administrativo sidebar.css aplicando fundo claro ao li.menu-item:hover, importado pela home via base/main.css. A correção zera fundo/sombra/transform do LI e do link nos cabeçalhos públicos. O efeito novo usa somente cor laranja e sublinhado discreto, sem caixa branca e sem elevar o link. Respeite foco por teclado e movimento reduzido.

Novo serviço autorizado: Dog Walker e Pet Sitter. “Serviços” agora abre /servicos/dog-walker-pet-sitter, com página própria e banner original completo em public/images/services/dog-walker-pet-sitter.png. Não recorte nem regenere essa imagem. O contato informado no banner é Thiago Turquetti, (11) 91571-2903, Sacadura Cabral — Santo André. A página oferece links de telefone e WhatsApp; não há agendamento ou cobrança pelo site. Não invente preços, disponibilidade ou qualificações.

O QUE JÁ FOI FEITO
Inicial, categorias, detalhe de produto, sacola, login/cadastro, redefinição de senha, conta e pedidos foram adaptados à identidade. Categorias têm busca, filtro e ordenação; não devem misturar ração de gatos com cães nem preencher roedores com itens genéricos de outras espécies. Produtos bloqueiam compra sem estoque ou preço válido e preservam quantidades na sacola. Os dados são reais da API; não invente produtos, preços ou avaliações para preencher as páginas.

ARQUIVOS PRINCIPAIS
- Home: views/home/index.html; public/css/pages/home-layout.css; public/js/pages/home/catalog.js e layout.js.
- Cabeçalho/tema interno: public/js/layout/public-header.js e public/css/layout/storefront-theme.css. Só body.storefront-page usa o header novo injetado; a home tem header próprio e não carrega esse JS.
- Categoria/produto: views/categories/detail.html e views/products/detail.html; public-category.css, public-product.css e respectivos scripts em public/js/pages/.
- Sacola: views/cart/index.html e public/css/pages/cart-storefront.css.
- Conta: views/auth/login.html, reset-password.html, account.html e orders.html; public/css/pages/auth-storefront.css.
- Institucionais: views/legal/privacy.html, views/legal/terms.html, views/newsletter/unsubscribe.html; public/css/pages/legal-storefront.css.
- Rastreamento público: views/delivery/public-tracking.html; public/css/pages/tracking-storefront.css. Só /acompanhar-entrega em app.js serve esse arquivo; /admin/acompanhar-entrega continua em tracking.html.
- Dog Walker e Pet Sitter: views/services/dog-walker-pet-sitter.html; public/css/pages/dog-walker-pet-sitter.css; rota estática em app.js; banner em public/images/services/dog-walker-pet-sitter.png. Os cabeçalhos recolhem o menu até 992px; mantenha CSS e JS sincronizados.

REGRAS IMPORTANTES
Preserve todos os IDs, forms, campos, sessão, favoritos, notificações, cart-sidebar.js, frete, cupons e checkout existentes. Não executar pagamentos reais, cadastrar contas, cancelar newsletter com tokens reais ou alterar dados do banco para testar aparência. Não mexer no painel nem na navegação operacional do entregador sem necessidade. Módulos clínicos/agendamentos foram removidos; não restaurá-los. O serviço não clínico Dog Walker/Pet Sitter foi explicitamente autorizado e tem uma página estática, sem restaurar APIs/tabelas antigas. Nada de commit/push/deploy sem pedido.

INTEGRAÇÕES JÁ CORRIGIDAS
A home lê /?busca=...#products e o formato legado /#products?busca=...; /?favoritos=1#products abre o painel real após carregar o catálogo. Lupa e menu mobile se fecham mutuamente. Preserve esses comportamentos.

ESTADO ATUAL E VERIFICAÇÃO
A etapa 3 está implementada: privacidade, termos, cancelamento de newsletter e rastreamento público usam o tema aprovado. As 16 seções dos documentos legais foram preservadas literalmente, com as datas originais. Cancelamento de newsletter mantém seu script e status; não foi executado cancelamento real. Rastreamento público mantém os IDs e os scripts map.js/tracking.js originais; a tela administrativa e a navegação do entregador continuam separadas. Em seguida foram adicionados o serviço e o avatar. As páginas internas carregam storefront-theme.css?v=20261020-4 e public-header.js?v=20261020-2; a home carrega home-layout.css?v=20261020-4 e catalog.js?v=20261020-2 para atualizar o cache.

Passaram 83 testes pertinentes (incluindo novos testes de avatar/sessão, rota e banner do serviço; além de loja, estoque, frete/cupons, pagamentos isolados, entrega e e-mails simulados). Isso não equivale a validação visual. O acesso de inspeção pelo navegador foi bloqueado anteriormente por política de URL/protocolo; não contorne com CDP, outra superfície ou ferramenta. Use acesso legítimo quando disponível e informe o que não conseguiu verificar. O servidor local pode já estar aberto para o usuário; não o encerre sem necessidade.

PRÓXIMO PASSO
Confira git status/diff e preserve os commits e mudanças do usuário. Revise visualmente as páginas em desktop e celular quando houver acesso legítimo, sobretudo o hover sem quadrado branco, login/cadastro, sacola lateral e mapa expandido. Use dados de teste isolados quando necessário, sem seed no banco real. Corrija somente problemas encontrados, mantendo o visual aprovado. Painel administrativo e tela operacional do entregador não fazem parte do redesenho público. Não declare o site pronto para produção: a integração de pagamentos e demais pendências de publicação têm seus próprios critérios nos documentos do projeto.

Se este chat não tiver acesso ao projeto, não finja editar arquivos locais: peça somente os arquivos necessários para a próxima mudança. Continue da situação real registrada abaixo, sem refazer a inicial aprovada.
```

## Registro final da etapa 3

Etapa concluída em código e verificada com 79 testes aprovados e links estáticos das 32 páginas. As mudanças que ficaram em andamento foram revisadas; nenhum cancelamento, conta, e-mail ou pagamento real foi executado. Os textos das oito seções da privacidade e das oito seções dos termos continuam literalmente iguais à versão anterior.

O rastreamento público usa documento novo e CSS escopado. O arquivo administrativo original, os scripts de mapa/rastreamento e a navegação do entregador foram preservados. Foram conferidos os IDs únicos, controles inicialmente ocultos, ordem dos scripts e política de mapas/referrer por testes.

O hover foi corrigido na causa (fundo do LI herdado do CSS administrativo), com texto laranja e sublinhado simples. Os links de CSS das páginas internas foram atualizados para a versão 20261020-3. A revisão visual no navegador continua pendente pelo bloqueio registrado; os testes de DOM simulado não são apresentados como prova visual.

Os registros anteriores são `CONTINUAR-RECONSTRUCAO.md` e `CONTINUAR-RECONSTRUCAO-02.md`, neste mesmo diretório.
