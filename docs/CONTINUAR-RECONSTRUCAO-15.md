# Continuidade — GPS das entregas — 23/10/2026

Prevalece sobre 14/13/12 para GPS e última publicação. Usuário pediu “implante o gps”, autorizando a implementação/publicação na demonstração Railway. Confirmou que `https://nacao-animal-production.up.railway.app/*` já foi autorizado na chave de navegador do Google Cloud.

## Implementação

A base de GPS já existia: pedido pago em SAIU_PARA_ENTREGA, link privado de 12 horas gerado pelo admin, posição do entregador enviada a cada 5 segundos com permissão e HTTPS, rota com origem no GPS real/endereço congelado do pedido, orientações/voz, acompanhamento autenticado do cliente e admin, revogação/apagamento da posição ao encerrar. Não reescrita nem alterada regra de pagamento/status.

Corrigidos problemas concretos:

- Em navegação/tela cheia, CSS ocultava avisos de GPS, rede, rota e Google Maps. Agora um bloco compacto mostra espera/erros; sucesso não cobre o mapa.
- Recusa tardia da chave Google depois do callback de carregamento agora mostra o erro imediatamente e não é mascarada pela próxima posição.
- Ao voltar pelo cache de navegação (BFCache), a viagem fica pausada e exige **Retomar viagem**, sem ligar GPS automaticamente.
- Gerações diferentes de requisições GPS/rota/preparação/wake lock não interferem na retomada nem publicam uma posição antiga após a pausa.

Arquivos: public/js/pages/delivery/driver.js, map.js, public/css/pages/delivery.css, views/delivery/driver.html e tests/delivery-browser.test.js. map.js ganhou onStatus opcional, preservando consumidores cliente/admin. Falha inicial de carga ainda pode exigir recarregar conforme aviso; browser não garante GPS em segundo plano e estimativas não usam trânsito em tempo real.

## Diagnóstico e configuração

Novo scripts/check-railway-gps.js: readonly, IDs/repo/domínio fixos da demonstração, não carrega .env, não altera process.env e não imprime chaves/corpos/tokens. Confere cinco endpoints, HTTPS/CSP/referrer, health, chaves válidas/distintas e resposta mapa-config contendo só a chave de navegador esperada.

Default não chama Google. `--probe-routes` faz UMA cotação anônima em /api/public/frete/cotar usando endereço público da própria loja. A consulta é realizada pelo Railway, cobrindo seu IP/autorizações; não cria pedido/cliente nem envia GPS. Cotar loja para ela mesma retornou 422 (Google aceitou, mas não retornou distância válida), portanto o script registra esse caso como providerReached/authorizationValidated e status inconclusive, nunca como GPS comprovado.

Para eliminar a dúvida da distância zero, root fez UMA segunda cotação ao endereço público da Prefeitura de Santo André (Praça Quarto Centenário, 1, Centro, Santo André/SP, 09015-080), conferido em https://web.santoandre.sp.gov.br/portal/servicos/1006/atendimento/portal/. Resultado real no Railway: HTTP200, success true, 3593 metros, R$9 de frete. Token da cotação foi descartado, nenhum pedido foi criado, nenhuma localização de pessoa foi utilizada. Não repetir consultas Google sem necessidade.

Todos os endpoints/headers/chaves estavam corretos no diagnóstico remoto, backend conectado e pagamentos desativados. Chaves presentes/distintas e autorização de domínio confirmada pelo usuário não substituem teste visual em celular: GPS físico e renderização Maps JavaScript NÃO foram inspecionados. Bloqueio anterior do navegador continua; não contornar via CUA/CDP/outros meios.

## Validação

- Suíte completa: 422 testes, 418 aprovados, 0 falhas, 4 integrações ignoradas.
- Depois foi adicionado caso de diagnóstico HTTP422: conjunto específico railway-gps 15/15 aprovado. Não alegar nova suíte completa de 423 sem executar.
- Teste backend com RUN_DB_TESTS=1 aprovado em PostgreSQL local, schema temporário isolado com Google/pagamentos/e-mails simulados; inclui token GPS, cliente/admin, atualização, expiração, rotação e encerramento. Schema removido pelo teste. Não foram criados dados reais em public ou no Railway.
- Links estáticos aprovados em 40 páginas; diff sem erros.
- Nenhuma alteração de migração, credencial, cliente/pedido/estoque real ou envio de e-mail/cobrança.

## Publicação e local

Adicionada .railwayignore para excluir .env/variantes, dependências, .git/.railway/.codex/.agents/.aws, certificados, uploads, backups, logs e artefatos da publicação por CLI. .env.example pode ser incluído. Preservar .env e banco locais.

Deploy via `railway up` do código local concluído: **64b7e7fa-6582-4554-8165-0321c83070ee — SUCCESS**. Destino é o mesmo projeto/serviço/ambiente do registro14. Após conclusão, diagnóstico GPS padrão aprovado: cinco endpoints HTTPS200, headers corretos, chaves distintas e resposta pública adequada. Quatro arquivos (HTML do entregador, driver.js, map.js e delivery.css) foram baixados por HTTP e comparados por SHA-256 com os locais: todos idênticos. Site, admin, login, produtos, health, APIs do catálogo e seis imagens200; login/perfil ADMIN confirmados; localhost200 e .env intacto. Nenhum commit/push: GitHub continua na base local 96347c4 update, alterações atuais sem commit. Um futuro deploy por GitHub precisa incluir esses arquivos para não perder os ajustes.

Servidor local reaberto após confirmar que 4600 não escutava: npm run dev sessão **8952**, porta4600, http://localhost:4600/. Preservar sem duplicatas. Node watch pode reiniciar enquanto arquivos são editados.

## Documentação operacional

docs/GPS-ENTREGAS.md explica configuração/operação/celular/diagnóstico. docs/entregas-notificacoes.md corrigiu domínio PetFlow antigo; README.MD seção GPS corrigiu texto30s para5s, Iniciar viagem, Routes e estimativas. Manter duas chaves Google separadas; não expor servidor. APP_URL remoto já é HTTPS correto.

Para usar: Admin > Pedidos > pedido em Saiu para entrega > Gerar link para o entregador. Ele abre no próprio celular por HTTPS e toca Iniciar viagem, permitindo localização e mantendo página visível/tela ativa. Cliente vê próprio pedido em Meus pedidos/aviso/e-mail; admin usa Acompanhar entrega. Só concluir ou Parar encerra o link. Não forçar pagamento/status de pedido remoto para demonstrar GPS com pagamentos desativados; teste físico de entrega deve ser autorizado e compatível com estágio legítimo do pedido.

Outras pendências e restrições permanecem nos registros14/13. Vixpi é futura produção limpa, Railway demonstração. Não apagar contas: o usuário cancelou a ideia de remover admin/clientes. Manter credenciais administrativas existentes e nunca registrar seus valores. Sem commit/push/limpeza automáticos.
