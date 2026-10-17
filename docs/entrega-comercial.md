# Entrega comercial — PetFlow v2

Preço informado pelo vendedor: **R$ 2.500**. Este pacote entrega o código do sistema instalável, os arquivos de interface, as migrações do banco, testes e instruções de operação. A ativação da loja exige configurar os serviços e dados do comprador.

## O que acompanha o projeto

- Loja com catálogo, categorias, sacola, conta do cliente, confirmação de e-mail e recuperação de senha.
- Pedidos, cupons, checkout PagBank, reserva de estoque e acompanhamento de entrega.
- Painel com produtos, fotos, fornecedores, compras, clientes, estoque, financeiro e configurações.
- Usuários administrativos, auditoria, atendimento ao consumidor e solicitações de privacidade.
- Upload de fotos e logo no Cloudinary, preservação da imagem atual em falhas e limpeza das imagens substituídas.
- Migrações versionadas, ferramentas de backup/restauração, testes e verificação de configuração para produção.

A versão é voltada à venda de produtos. Cadastro de pets, agenda e serviços clínicos não fazem parte da entrega.

## Instalação do comprador

1. Instale Node.js 22 ou superior, npm e PostgreSQL. Para backup e restauração, disponibilize `pg_dump` e `pg_restore` no PATH.
2. Extraia o ZIP e abra um terminal na pasta `petflow-v2`.
3. Execute `npm ci` para instalar as versões do arquivo de dependências.
4. Copie `.env.example` para `.env`. No PowerShell: `Copy-Item .env.example .env`.
5. Use o banco local `nacao-animal`; crie-o somente se ainda não existir. Configure `DB_NAME=nacao-animal` e `DB_EXPECTED_NAME=nacao-animal` no `.env` e preencha a conexão. Nunca use o banco de outra instalação. No Railway, use um projeto separado e a referência privada do PostgreSQL, com `DB_EXPECTED_NAME` correspondente ao nome criado nesse serviço.
6. Crie um JWT_SECRET aleatório próprio. Configure `JWT_EXPIRES_IN`, o e-mail e a senha do administrador. A senha inicial precisa de 12 caracteres, com maiúscula, minúscula, número e símbolo.
7. Execute `npm run db:migrate` e, na primeira instalação, `npm run db:seed-admin`. Reexecutar o seed atualiza a senha do administrador desse e-mail; guarde a credencial com o responsável pela loja.
8. Execute `npm start` e abra `http://localhost:4600` e `http://localhost:4600/admin/`.
9. No painel, complete os dados da empresa, endereço, telefone, e-mail e CNPJ. Cadastre categorias, fornecedores, produtos e saldos de estoque reais.

Os seeds de catálogo e clientes são ferramentas de demonstração. Não carregue contas de demonstração em produção: elas usam credenciais conhecidas.

## Integrações e publicação

| Serviço | Configuração necessária | Validação antes de abrir a loja |
| --- | --- | --- |
| Cloudinary | Cloud name, API key e API secret da mesma conta | `npm run check:cloudinary -- --upload` |
| Resend | Chave com permissão de envio e remetente autorizado | Cadastro, confirmação e recuperação de senha com entrega efetiva do e-mail |
| PagBank | Token próprio e `https://api.pagseguro.com` em produção | Checkout, pagamento, webhook, baixa de estoque, financeiro e estorno |
| Google Maps | Chave privada com Routes API; chave pública de Maps JavaScript restrita ao domínio | Cotação do frete e mapa de entrega por HTTPS |
| PostgreSQL | Banco separado, nome esperado e migrações aplicadas | `npm run release:check` e backup/restauração em instância de ensaio |

Em produção, defina `NODE_ENV=production`, `APP_URL` e `FRONTEND_URL` com a origem HTTPS real. Aplique todas as migrações, incluindo `113_cloudinary_assets.sql` e `114_atendimento_notificacoes.sql`, antes de iniciar esta versão. No Railway, o pre-deploy já executa o migrador.

Configure `DELIVERY_ORIGIN_ADDRESS` para o endereço da loja. A regra atual de frete usa a rota de carro: até 1 km grátis; acima disso, R$ 3 por quilômetro adicional ou fração. O comprador precisa aceitar essa regra ou contratar sua alteração antes da operação.

O comando Cloudinary com `--upload` cria uma imagem de 1 pixel na pasta `petflow-v2`, confere sua entrega pela CDN e remove a imagem ao terminar. O comando sem essa opção autentica a conta sem criar arquivo. As chaves ficam no servidor e não acompanham o pacote.

Hospedagem, domínio, consumo dos provedores e taxas de pagamento precisam ser mantidos nas contas do comprador. A contratação comercial deve definir instalação, personalizações, prazo de suporte e manutenção incluídos nos R$ 2.500.

## Critérios de aceite

1. Execute `npm test` e `npm run test:links`. A integração com PostgreSQL é ativada com `RUN_DB_TESTS=1` e usa schema temporário somente no banco local `nacao-animal`; os provedores de pagamento/e-mail/mapas são simulados nesses testes.
2. Execute `npm audit --omit=dev --audit-level=high`.
3. No ambiente definitivo, execute `npm run release:check`. A configuração local em `development` não deve ser aprovada como produção.
4. Execute o teste real do Cloudinary, cadastre e substitua uma foto de produto e um logo no painel. Confirme a imagem na loja e a preservação do arquivo atual quando uma edição falhar.
5. Execute os testes de compra, entrega e atendimento de `docs/entrega-producao.md`. Pagamentos e estornos reais devem ser conferidos pelo responsável da conta PagBank.
6. Confira `/api/health` e `/api/readiness`. Readiness verifica configuração, migrações, dados da loja e catálogo; não autentica provedores nem comprova entrega de e-mail ou pagamento real.
7. Guarde um backup fora da aplicação e ensaie restauração em outro banco antes da entrega definitiva.

## Limites operacionais

- E-mails opcionais de pedidos, atendimento e newsletter têm uma tentativa de envio, sem fila persistente nem retentativas automáticas. A equipe deve acompanhar os pedidos e protocolos no painel se o provedor falhar.
- O GPS exige a página do entregador aberta, permissão de localização e HTTPS. O navegador pode suspender o compartilhamento com a tela bloqueada ou em segundo plano.
- Desativar um produto conserva sua imagem para referências e histórico. Trocar uma foto remove o arquivo anterior somente quando ele pertence à conta configurada e à pasta gerenciada `petflow-v2`.
- Falhas de limpeza do Cloudinary são registradas com o identificador do arquivo para conferência manual; não apagam a imagem salva no cadastro.

## Arquivos e licença

`npm run release:package` gera `dist/petflow-v2-1.0.0.zip` e seu SHA-256. O ZIP usa uma lista de arquivos do aplicativo, contém um manifesto `ENTREGA.json` com hashes e exclui `.env`, Git, dependências instaladas, backups e logs. Nunca envie uma cópia completa da pasta de desenvolvimento ao comprador.

A licença existente é **MIT**, identificada no arquivo `LICENSE`, e permite comercialização com preservação dos avisos. A entrega do código sob essa licença permite cópia e redistribuição; o pacote não declara exclusividade. Os termos comerciais da venda precisam corresponder aos direitos efetivamente oferecidos.
