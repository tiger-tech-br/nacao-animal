# Revisão para entrega comercial — 12/10/2026

O código do PetFlow v2 foi preparado para entrega como sistema instalável pelo preço de R$ 2.500 informado pelo vendedor. O pacote inclui código, interface, migrações, testes e manual do comprador. As contas, os dados da empresa e a ativação em produção são configurados para a loja que receber o sistema.

## Correções verificadas

- Cloudinary: Cloud name local corrigido para `deeapnolt`, com chaves preservadas; autenticação, upload temporário, entrega pela CDN e remoção aprovados em teste real.
- Fotos e logo: validação antes do upload, limites multipart, respostas 400/413/503, URL e public ID salvos; falhas do banco limpam a imagem nova, e trocas removem apenas a imagem realmente substituída. Edições concorrentes e edições sem foto são protegidas no banco.
- Marca da loja: nome e logo configurados no painel aparecem na home e nos cabeçalhos públicos, com URL validada e fallback local.
- Instalador: diferenças LF/CRLF/BOM não geram falso conflito de migração entre Windows e Linux. Alterações reais de SQL continuam bloqueadas.
- Privacidade e pós-venda: tipos SQL explícitos corrigem respostas de erro no PostgreSQL; migração 114 habilita avisos de atendimento, sem duplicar aviso ao repetir a mesma resposta.
- Cancelamento: pagamento e estorno são decididos com o pedido bloqueado. Falha no estorno preserva pedido/estoque; cancelamentos simultâneos não duplicam estorno ou devolução.
- Prontidão: credenciais de exemplo, desenvolvimento, catálogo indisponível e dados obrigatórios ausentes não aprovam a liberação.
- Dependências: `compression` e `proxy-addr` atualizados para versões compatíveis corrigidas.
- Entrega: licença MIT alinhada aos metadados, guia do comprador, checklist, CI e gerador de ZIP com manifesto e verificação de segredos.

## Evidências

| Verificação | Resultado |
| --- | --- |
| Suíte completa com `RUN_DB_TESTS=1` | 128 aprovados; 0 falhas; 0 ignorados |
| PostgreSQL dos testes | Instância temporária PostgreSQL 18, exclusivamente em localhost:55439; schemas isolados |
| Cloudinary/upload | 37 testes específicos com provedor simulado, além de upload/CDN/remoção reais |
| Links e arquivos estáticos | 31 páginas HTML verificadas |
| `npm audit --omit=dev` | 0 vulnerabilidades conhecidas na consulta de 12/10/2026 |
| Migrações do banco configurado | 113 e 114 aplicadas; migrações anteriores preservadas |
| Backup antes da migração 114 | Arquivo custom PostgreSQL criado e índice validado por `pg_restore --list` |
| Configuração de operação atual | 34/35 critérios aprovados; dados públicos da empresa ainda incompletos |

Os testes de compra usam PostgreSQL real e simulam PagBank, Resend e Google Maps. Não houve cobrança, estorno real nem envio de mensagens a clientes nesta validação. O backup foi lido e validado, mas um ensaio completo de restauração continua no checklist operacional.

## Para ativar a loja do comprador

1. Instalar seguindo `docs/entrega-comercial.md`, com credenciais próprias e banco separado.
2. Em Configurações, preencher CNPJ, telefone, e-mail, endereço, número, bairro, cidade, estado e CEP. Esses valores não foram inventados nem preenchidos por esta revisão.
3. Publicar esta versão e repetir `npm run release:check` no ambiente definitivo. As correções de código desta revisão não foram publicadas automaticamente no Railway.
4. Concluir o aceite de e-mail, compra, webhook, entrega, cancelamento e backup/restauração de `docs/entrega-producao.md`, com o responsável das contas.

O pacote exclui `.env`, Git, dependências instaladas, backups e logs. Os dados pessoais e credenciais do banco de desenvolvimento/produção não acompanham a entrega. As limitações operacionais de e-mail e GPS e os termos da licença estão descritos no guia do comprador.
