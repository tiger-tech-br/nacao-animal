# Prompt de continuidade — etapa 3

Copie o bloco abaixo para continuar, mesmo em um chat sem o histórico anterior.

```text
Continue a reconstrução do site Nação Animal.

Projeto local: C:\Users\andre\Desktop\gemini-cursos\front-end\tiger-tech\projetos\nacao-animal.
Stack: Node/Express, HTML/CSS/JavaScript. Comando local: npm run dev; URL http://localhost:4600. Sem build obrigatório.

VISUAL APROVADO
Referência: public/images/reference/layout-home.png. É o QUARTO layout do painel de seis imagens, amarelo e laranja, originalmente no canto inferior esquerdo. Mantenha a identidade e as proporções. A inicial tem logo grande, título “O melhor para o seu pet, sempre!”, botão laranja, golden retriever e gato à direita, faixa de benefícios e vitrine creme. Asset separado com transparência: public/images/hero/nacao-animal-dog-cat.png. Logo: public/images/logo/nacao-animal-logo-transparent.png. Não substitua os animais ou o estilo por outra proposta.

PREFERÊNCIAS MAIS RECENTES
Menu: Início, Sobre, Produtos, Serviços e Contato. SEM Blog. O usuário rejeitou o quadrado branco do hover. A causa foi o CSS administrativo sidebar.css aplicando fundo claro ao li.menu-item:hover, importado pela home via base/main.css. A correção zera fundo/sombra/transform do LI e do link nos cabeçalhos públicos. O efeito novo usa somente cor laranja e sublinhado discreto, sem caixa branca e sem elevar o link. Respeite foco por teclado e movimento reduzido.

O QUE JÁ FOI FEITO
Inicial, categorias, detalhe de produto, sacola, login/cadastro, redefinição de senha, conta e pedidos foram adaptados à identidade. Categorias têm busca, filtro e ordenação; não devem misturar ração de gatos com cães nem preencher roedores com itens genéricos de outras espécies. Produtos bloqueiam compra sem estoque ou preço válido e preservam quantidades na sacola. Os dados são reais da API; não invente produtos, preços ou avaliações para preencher as páginas.

ARQUIVOS PRINCIPAIS
- Home: views/home/index.html; public/css/pages/home-layout.css; public/js/pages/home/catalog.js e layout.js.
- Cabeçalho/tema interno: public/js/layout/public-header.js e public/css/layout/storefront-theme.css. Só body.storefront-page usa o header novo injetado; a home tem header próprio e não carrega esse JS.
- Categoria/produto: views/categories/detail.html e views/products/detail.html; public-category.css, public-product.css e respectivos scripts em public/js/pages/.
- Sacola: views/cart/index.html e public/css/pages/cart-storefront.css.
- Conta: views/auth/login.html, reset-password.html, account.html e orders.html; public/css/pages/auth-storefront.css.
- Etapa 3: confira o registro final abaixo sobre privacidade, termos, newsletter e rastreamento público.

REGRAS IMPORTANTES
Preserve todos os IDs, forms, campos, sessão, favoritos, notificações, cart-sidebar.js, frete, cupons e checkout existentes. Não executar pagamentos reais, cadastrar contas, cancelar newsletter com tokens reais ou alterar dados do banco para testar aparência. Não mexer no painel nem na navegação operacional do entregador sem necessidade. Módulos clínicos/agendamentos foram removidos; não restaurá-los. Serviços no menu leva aos benefícios da inicial. Nada de commit/push/deploy sem pedido.

INTEGRAÇÕES JÁ CORRIGIDAS
A home lê /?busca=...#products e o formato legado /#products?busca=...; /?favoritos=1#products abre o painel real após carregar o catálogo. Lupa e menu mobile se fecham mutuamente. Preserve esses comportamentos.

VERIFICAÇÃO E PRÓXIMO PASSO
Leia o registro final desta etapa, confira git status/diff e valide os arquivos reais antes de alterar. Na etapa 2 passaram 55 testes, links de 31 páginas, sintaxe JS e contratos dos formulários. Novas páginas precisam de conferência visual em desktop e celular. O acesso de inspeção pelo navegador foi bloqueado anteriormente por política de URL/protocolo; não contorne esse bloqueio com CDP, outra superfície ou ferramenta. Use acesso legítimo quando disponível e informe o que não conseguiu verificar. O servidor local pode já estar aberto para o usuário; não o encerre sem necessidade.

Se este chat não tiver acesso ao projeto, não finja editar arquivos locais: peça somente os arquivos necessários para a próxima mudança. Continue da situação real registrada abaixo, sem refazer a inicial aprovada.
```

## Registro final da etapa 3

Em atualização. Até a conclusão do registro, privacidade/termos/newsletter e rastreamento público podem estar em implementação; confira os arquivos antes de assumir que estão prontos.

Os registros anteriores são `CONTINUAR-RECONSTRUCAO.md` e `CONTINUAR-RECONSTRUCAO-02.md`, neste mesmo diretório.
