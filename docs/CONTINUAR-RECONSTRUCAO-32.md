# Continuidade — Répteis e produtos — 25/10/2026

O usuário pediu categoria **Répteis** (tartarugas e jabutis), somente **Rações**, sem acessórios, e fotografia real de jabuti em destaque. Autorizou também produtos fictícios nessa categoria, mantendo os preços baixos usados nos testes.

- A taxonomia compartilhada usa slug `repteis` e reconhece `réptil` como alias no cadastro. Apenas `racoes` é permitida; cadastro/vitrine não oferecem acessórios ou rações úmidas para Répteis.
- Inicial, diretório, atalhos e filtros de produtos incluem a categoria. A inicial fica com oito cards em duas linhas no desktop.
- Migração aditiva121 cria a categoria. Foi aplicada localmente; no Railway entra pelo pre-deploy normal.
- Seeder contém19 produtos no total, dois novos: `NA-TESTE-REPTEIS-TARTARUGA-01` (ração100g, R$6) e `NA-TESTE-REPTEIS-JABUTI-01` (ração100g, R$10), cinco unidades cada. A aplicação deve usar apenas esse subset, preservando todos os produtos e estoques existentes.
- Foto real: `public/images/categories/reptiles.jpg`, de Termininja/Wikimedia Commons, CC0. Embalagens distintas de teste em `turtle-food.jpg` e `tortoise-food.jpg`, geradas com ferramenta integrada. Fontes, caminhos e prompts em `docs/IMAGENS-REPTEIS-2026-10-25.md`.
- Referências de `catalog-taxonomy.js` versionadas para20261025-2 em catálogo, favoritos e produtos administrativos.
- `RUN_DB_TESTS=1 npm test`: **667 testes aprovados, zero falhas e zero ignorados**. Links das40 páginas aprovados; visual local do destaque e das duas rações conferido. Não afirmar publicação antes de conferir o deploy e o catálogo remoto.

Na solicitação anterior de Jardinagem, os quatro SKUs já previstos foram cadastrados no Railway (terra, fertilizante, vaso e regador, cinco unidades cada); no localhost já existiam e foram preservados. Não duplicar.

Preservar o pedido fictício da atualização31, Google Maps externo e compartilhamento manual da atualização30. Não restaurar os simuladores removidos. Não alterar `.env`, contas, pagamentos, estoque ou dados comerciais além dos produtos fictícios expressamente autorizados.
