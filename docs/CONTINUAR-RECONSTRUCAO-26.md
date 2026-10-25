# Continuidade — catálogo e Jardinagem — 25/10/2026

O usuário pediu Jardinagem e subcategorias de produtos, depois produtos fictícios nas novas divisões e uma imagem de planta com aparência fotográfica no card. O escopo anterior do GPS permanece resolvido e não deve ser ampliado.

## Categorias e subcategorias

- Cães e Gatos: Rações, Rações úmidas e Acessórios.
- Pássaros (URL compatível `/categorias/aves`), Roedores e Peixes: Rações e Acessórios.
- Jardinagem: Terras e fertilizantes e Acessórios.
- Links diretos usam `?tipo=racoes`, `?tipo=racoes-umidas`, `?tipo=acessorios` ou `?tipo=terras-fertilizantes`.
- Módulo compartilhado `public/js/catalog-taxonomy.js`; campo `produtos.subcategoria` opcional, com validação no servidor e seletor dependente no admin.
- Migração nova `119_subcategorias_jardinagem.sql` aplicada no banco **local**. Migrações anteriores não foram alteradas.
- Os cards da home e do diretório exibem sublinks sem links aninhados. O catálogo aceita seleção, pesquisa, ordenação e histórico.

## Produtos fictícios e imagens

- `scripts/seed-test-products.js` agora contém seis itens antigos e onze novos: rações secas e úmidas para cães/gatos, alimentos para pássaros/roedores/peixes, terra vegetal, fertilizante, vaso e regador.
- Aplicação concluída somente no PostgreSQL local: **11 criados, 6 preservados, 17 no total**. Preços dos novos: R$ 6 ou R$ 10, estoque inicial 5, nomes identificados com `[TESTE]` e descrição demonstrativa.
- Verificado no banco real local que produtos antigos, fotos, preços e estoques ficaram intactos. Segunda execução não duplicou registros ou repôs estoque.
- Nenhuma compra, pagamento ou mensagem a clientes foi criada.
- Planta fotográfica gerada por IA salva em `public/images/categories/gardening-v2.jpg`, usada na home, diretório e cabeçalho da categoria. A ilustração SVG anterior não é mais referenciada.
- Oito novas imagens de produtos foram salvas em `public/images/products/`; as rações secas usam as duas fotos já existentes adequadas a cães/gatos.
- Prompts completos e caminhos estão em `docs/IMAGENS-CATALOGO-TESTE-2026-10-25.md`. Ferramenta integrada image_gen; originais mantidos, arquivos JPEG otimizados para web, sem mudar a composição.

## Menu público

O usuário corrigiu a cor pedida: o link Sair deve ser **laranja**, como Início, mais afastado dos outros links e sem sublinhado no estado normal; ao passar o mouse, recebe o mesmo hover do menu e sublinhado. CSS ajustado na home e no tema das páginas internas, inclusive no celular.

## Validação e disponibilidade

- Última rodada focada: 43 testes aprovados, sem falhas. Links estáticos de 42 páginas aprovados e diff sem erros de espaços.
- Na rodada anterior, cadastro administrativo, upload, validação e integração PostgreSQL em schema isolado também passaram.
- API local retornou 17 produtos; todas as 14 combinações de categoria/subcategoria têm itens e 17 caminhos únicos de imagens responderam HTTP 200 com conteúdo de imagem.
- Home, diretório e Jardinagem responderam HTTP 200. O site está disponível em `http://localhost:4600/` nesta rodada.
- Não houve commit, push, publicação no Railway ou alteração do banco remoto. Para levar estas mudanças à demonstração remota será necessário publicar código e assets, aplicar a migração e cadastrar os produtos de teste no destino apropriado, sem presumir que o banco remoto já os contém.
- Não alterar `.env`, credenciais, pagamentos, GPS ou dados de clientes por causa desta tarefa.
- Preservar documentos/PDFs existentes em `output/` e os guias administrativos/de hospedagem, que já estavam presentes.
