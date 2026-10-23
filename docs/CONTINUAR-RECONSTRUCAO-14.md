# Continuidade — demonstração Railway publicada — 22/10/2026

Prevalece sobre registros 13/12/11/10 quanto à hospedagem. O usuário autorizou deploy e importação das variáveis existentes, concluídos. Railway é SOMENTE demonstração para cliente. Vixpi Site Pro R$39,90 será a produção definitiva, com banco novo e limpo e administrador exclusivo, conforme registro 13. Não apagar dados atuais.

## Publicação confirmada

- Site: https://nacao-animal-production.up.railway.app/
- Administração: https://nacao-animal-production.up.railway.app/admin/
- Deploy final `ea9df7f7-2c79-41f6-939d-11d973e2a8ec`: SUCCESS.
- Fonte: GitHub tiger-tech-br/nacao-animal, master, commit 053770cddf9c1e31c4a2e5d8caa08056db1a50a9. Nenhum commit/push feito pelo agente.
- Projeto renomeado de alert-hope para nacao-animal; domínio corrigido da porta errada 5432 para 4600.
- As 42 variáveis locais foram importadas com adaptações remotas: NODE_ENV production, APP_URL/FRONTEND_URL HTTPS, conexões DB_* e DATABASE_URL/POSTGRES_URL por referências ao serviço Postgres. DB_EXPECTED_NAME corresponde a PGDATABASE remoto (railway). JWT exclusivo da demonstração gerado sem alterar o local. Pagamentos desativados, provider pending, sandbox.
- .env local não foi alterado. Código já suporta os dois ambientes por configuração; não foi preciso remover/comentar localhost.
- Banco remoto: 39 migrações conferidas/aplicadas até 117; um administrador; seis produtos [TESTE] aprovados, com seis imagens já existentes; ZERO clientes e ZERO pedidos copiados/criados. Não semeados fornecedores/compras, nem enviadas mensagens ou cobranças reais.
- Bootstrap preserva administrador existente; só cria quando usuarios está vazia. Só cria produtos quando produtos está completamente vazia; não repõe catálogo parcial ou estoque consumido. Fotos somente NULL nos SKUs/nomes/empresa aprovados.

## Recursos e autenticação Railway

Project: 69f7f38b-5d4c-4e40-9d7f-8417786a8883. Environment production: 05621372-8739-427e-9a5b-ce4bc49c815e (nome da plataforma, finalidade demonstrativa). Serviço app: a258d23c-2278-4053-aae5-62fe5b0c4675. Postgres: 746e33f5-3596-4d17-b14c-12cadec7b071. Volume montado em /var/lib/postgresql/data.

Conector OAuth falhou com invalid_request/id_token_hint. Usuário concluiu login oficial da CLI no navegador. Comandos autenticados precisam elevação neste ambiente: sandbox pode dizer Unauthorized mesmo com login válido. CLI 5.30.1 em APPDATA/npm/node_modules/@railway/cli/bin/railway.js. Não imprimir autenticação, variáveis brutas, senhas, tokens ou URLs de banco. Nenhuma chave SSH criada; bootstrap usou proxy público.

## pgAdmin externo e administrador

TCP proxy público habilitado. DATABASE_PUBLIC_URL foi criada em Postgres e referenciada pelo app, sem substituir sua conexão privada. No pgAdmin, General/Name é livre (ex.: Nação Animal — Railway). Connection:

- Host: autorack.proxy.rlwy.net
- Port: 35483
- Maintenance database: railway
- Username: postgres
- Password: PGPASSWORD em Postgres > Variables; não registrar o valor em chat/Git/docs.
- SSL mode: require (bootstrap externo com TLS confirmado).

Tabelas em Databases > railway > Schemas > public > Tables; atualizar a árvore. URL conecta; migrações criam as tabelas. Fonte oficial: https://docs.railway.com/databases/postgresql#connecting-externally.

Admin do site: admin@nacao-animal.local. Senha é o valor de ADMIN_PASSWORD no .env local, linha 105 nesta data; importado para variables do app remoto. Não registrar a senha. Usuário pediu acesso; arquivo foi oferecido no editor na linha correta. Login e /api/auth/me ADMIN confirmados, sem imprimir token/senha.

O usuário cogitou remover clientes/administrador durante a conclusão, mas cancelou antes de qualquer exclusão: “deixa pra lá, pode seguir”. MANTER acesso. Nenhuma exclusão ou redefinição de senha existente realizada.

## Scripts locais desta rodada

- railway-demo-config.js: construção pura das variáveis remotas, sem mutar locais.
- configure-railway-demo.js: destino fixo; leitura padrão, --apply explícito; importa via JSON stdin, sem arquivos/argumentos de segredos. Configura startCommand npm start, preDeployCommand npm run db:migrate e healthcheck /api/health timeout 100; confere flags e retorno booleano da API.
- enable-railway-demo-pgadmin.js: reutiliza/cria TCP proxy e DATABASE_PUBLIC_URL sem mostrar credenciais; --apply explícito.
- bootstrap-railway-demo-db.js: guards de IDs/repo/serviços/proxy/banco/credenciais/pagamentos false+sandbox, TLS e advisory lock. Filhos usam ambiente remoto em pasta temporária vazia, sem leitura do .env local. Saídas privadas capturadas; apenas contagens. Exclusivo da demonstração, NÃO usar na Vixpi.
- verify-railway-demo.js: verifica páginas/APIs/imagens, login/perfil ADMIN, localhost e integridade do .env; token/credenciais em memória. Login atualiza ultimo_login; não cria clientes/pedidos/mensagens/cobranças.

Inicialmente a aplicação conectava ao DB, mas health retornava migrations_pending. Bootstrap remoto concluiu as migrações. Predeploy/health foram configurados explicitamente por API e o deploy final passou. Não executar seed-admin em cada deploy (redefine senha).

## Verificação e local

Suíte completa: 401 testes, 397 aprovados, 0 falhas, 4 integrações ignoradas. Depois foi adicionado um teste de flags: conjunto focado final 25/25 aprovado; não apresentar 402 como nova execução completa. Sintaxe/diff conferidos. Após deploy final: HTTP 200 em /, /admin/, /login, /produtos, /api/health, /api/public/produtos e /api/public/categorias; 6 produtos/6 imagens 200; login/perfil ADMIN ok; localhost health 200 e .env intacto.

Navegador NÃO inspecionado: bloqueio anterior continua, sem contorno via CUA/CDP. Não alegar teste visual. E-mail real, frete Google a partir do host remoto, pagamentos, backups/restore e fluxo comercial completo ainda não homologados. APP_URL remoto agora HTTPS; local permanece loopback.

A antiga sessão local 72527 não existia mais. Confirmada ausência de processo escutando 4600, reaberto um único npm run dev, sessão **42729**. Preserve sem duplicatas. http://localhost:4600/ e /admin/. IP Wi-Fi anterior 192.168.0.9: reconferir antes de informar acesso móvel local. Railway abre fora dessa rede.

Pendências anteriores continuam: baixa de contas a pagar de fornecedor; formulários Atendimento/LGPD oferecem criar/excluir sem endpoints; conclusão LGPD pendente não efetiva exclusão; ativação segura da conta pública de cliente criado no painel; homologações externas e integração de pagamento. Sem cobranças/e-mails reais para testes sem autorização própria.

Vixpi: PostgreSQL novo, sem restaurar demonstração, administrador exclusivo e configuração mínima. Migração 108 insere PETFLOW10 ativo/público; 115/116 identidade/contato precisam conferência. Preparar instalação comercial limpa sem editar SQL histórico/checksums ou executar seeds demonstrativos.

Preservar arquivos alterados e não rastreados; os scripts/docs desta rodada podem ainda não estar no GitHub. Não fazer commit/push ou limpar diretórios automaticamente.
