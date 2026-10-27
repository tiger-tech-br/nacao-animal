# Continuidade — pedidos GPS, subtítulo e cores dos cards — 26/10/2026

## Pedidos fictícios para testar entregas

O usuário pediu mais pedidos de teste. Foram criados três na demonstração Railway, todos **SAIU_PARA_ENTREGA**, com item/total/frete zerados, sem checkout, e-mail, reserva, movimento de estoque ou lançamento financeiro. Conta fictícia existente foi reutilizada; nenhuma senha foi alterada. O pedido anterior `0e8a7e6a-984a-45a1-8fc6-01afdca678c3` já estava ENTREGUE e foi preservado, incluindo seu rastreamento.

| Pedido | Destino fictício | Marcador |
| --- | --- | --- |
| c6b6e391-cca0-4e01-bf57-24a3989e7f21 | Própria loja | NA-DEMO-GPS-20261026-01 |
| edae8c72-de1f-4563-8f56-8fbfbfd330e8 | Parque Celso Daniel | NA-DEMO-GPS-20261026-02 |
| 41ea6974-27ab-459c-afa0-a55ad055bcef | Parque Central | NA-DEMO-GPS-20261026-03 |

Endereços dos parques conferidos no site da prefeitura: https://www3.santoandre.sp.gov.br/turismosantoandre/parques-urbanos/ . Não há destinatários ou entregas reais nesses locais.

Fixture pontual fora do Git: `C:/Users/andre/.codex/visualizations/2026/10/20/01a15af5-bfd3-7431-b704-25164e5386c5/pedidos-gps-20261026.cjs`. Dry-run, aplicação e verificação autenticada concluídos. A comparação antes/depois confirmou estoque, financeiro, reservas e movimentos inalterados. Cada pedido tem um aviso administrativo e um do cliente pelos triggers existentes. Os três pedidos foram conferidos via API administrativa, acompanhamento da conta fictícia e link privado do entregador. Não foram iniciados/concluídos para verificar.

Links do entregador ficam no arquivo local `pedidos-gps-20261026.json`, na mesma pasta da fixture; não copiar esses tokens para o repositório. Validade de 12 horas, CARRO. Gerar outro pelo painel substitui o anterior. Não recriar o lote em uma retomada: a fixture reconhece os marcadores e não modifica pedidos já existentes.

## Interface

- O subtítulo **Painel administrativo** da marca lateral aumentou de11px para14px. Logo/título e estrutura do menu foram preservados. `admin-theme.css` versionado em20261026-2 nas16 páginas que o utilizam.
- Novo pedido do usuário: cada card com animais deve ter fundo de cor diferente. Os seis recortes já existentes foram reutilizados nas áreas de imagem dos cards, com fundo aplicado por CSS: cães pêssego, gatos lilás, pássaros verde, peixes azul, roedores rosa, répteis amarelo. Sem gerar/editar imagens novamente.
- Aplicado na inicial e em `/categorias`; `home-layout.css` e `category-directory.css` em20261026-3. Plantas/acessórios preservados. Cor se limita à área da imagem do card. Imagens de destaque fora dos cards continuam transparentes e inteiras, sem molduras.
- Esta decisão de cores e reutilização dos recortes nos cards atualiza a orientação de associação da atualização34; não restaurar as fotos anteriores nos seis cards com animais sem nova solicitação.
- **30 testes existentes de catálogo/categorias aprovados**, zero falhas/ignorados; links das40 páginas aprovados. Verificação visual local confirma as seis cores distintas e o subtítulo14px sem texto cortado. Antes de declarar publicação, conferir Railway SUCCESS, GitHub verify e versões remotas.

Preservar `.env`, configurações, credenciais, demais clientes/produtos/pedidos e pagamentos desativados. Não incluir `.codex/config.toml`, `tmp/`, a fixture pontual ou seus tokens no commit.
