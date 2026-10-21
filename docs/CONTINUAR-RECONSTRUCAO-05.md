# Continuidade — 21/10/2026

O usuário retomou o trabalho no Codex. Este registro complementa a etapa 4 e substitui a instrução anterior de parar após gerar as imagens.

## Ponto de parada atualizado

Usuário pediu continuar, mas encerrar alterações quando o limite estiver próximo e manter o site funcionando no navegador. Consulta do limite nesta etapa: 78% usado / 22% disponível na janela atual (não é contagem exata de tokens). Encerrar esta rodada depois da conferência, preservando servidor e prompt.

Usuário corrigiu a chave do servidor e o frete real foi liberado. Depois de reiniciar, duas cotações anônimas retornaram **HTTP 200** com token presente: **16 metros / R$ 0** e **1.586 metros / R$ 3**, coerentes com a tarifa. Não imprimir tokens nem chaves. A falha anterior API_KEY_INVALID foi resolvida.

Servidor foi reiniciado para carregar o `.env`: sessão atual **25874**, `npm run dev` com rede externa, porta 4600. Home, catálogo, carrinho, API de produtos, CEP principal e cotação retornaram HTTP 200. Após separar as chaves, a home e a cotação de 1.586m/R$3 foram novamente confirmadas HTTP200. Não houve pedido/cobrança/e-mail de teste. Abrir home foi solicitado pela ferramenta do app; retorno queued. O usuário confirmou navegador na home por contexto ambiente; sem afirmar inspeção visual. Nenhuma mudança adicional de código nesta rodada.

Chaves separadas: usuário criou e salvou nova GOOGLE_MAPS_BROWSER_API_KEY seguindo as instruções para Maps JavaScript API e restrição Sites autorizando http://localhost:4600/* e http://127.0.0.1:4600/*. Conferência privada confirmou dois valores diferentes, ambos com formato esperado. Após reiniciar, GET /api/public/entregas/mapa-config retornou200 com a chave do navegador correspondente ao .env e diferente da chave do servidor, com Cache-Control:no-store. Não imprimir a resposta bruta desse endpoint. Fonte revisada independentemente confirma ausência de fallback para a chave privada. Não afirmar renderização do mapa validada: não houve teste visual autenticado. Restrições efetivas no Google Cloud não foram inspecionadas. Ao publicar, acrescentar endereço Railway/domínio à chave do navegador. Alterações de chaves devem ser locais, sem chat; reiniciar somente este servidor quando necessário.

No teste adicional, a consulta do CEP 09060700 encontrou timeout de 6s em cada provedor e retornou 503. O preenchimento manual permitiu cotar o segundo trajeto com sucesso. Não esconder essa limitação externa nem inventar endereço/distância; repetir consulta de CEP apenas se necessário. CEP 09060820 foi validado com sucesso.

## Implementado nesta etapa

- `/produtos` agora é um catálogo completo, separado da vitrine da inicial. Usa `views/products/index.html` e reutiliza `category-detail.js` com a configuração `todas`. Busca, seleção de categoria, ordenação e navegação pelo histórico preservadas. Menu Produtos e link Ver todos os produtos abrem esse catálogo.
- Catálogo não anuncia preço ausente/inválido como zero e bloqueia adicionar esses itens. Adicionar novamente preserva a quantidade já existente.
- Sino público usa as APIs existentes, com atualização periódica. Ao abrir e renderizar, marca apenas os IDs exibidos como lidos; o contador atualiza após confirmação do servidor. Consultar com painel fechado não marca mensagens. Proteções contra respostas atrasadas após troca de sessão/logout e contra polling duplicado no iframe do carrinho foram adicionadas. Admin mantém leitura manual.
- Boas-vindas persistente e única por conta de cliente: `database/sql/117_boas_vindas_cliente.sql`. Migração já aplicada SOMENTE ao PostgreSQL local pelo migrador existente; NÃO editar esse arquivo após aplicação. Reaproveita a mensagem legada e seu estado de leitura, preenche contas existentes e cria novas mensagens por trigger. Não cria avisos para clientes administrativos sem conta. O banco local não tinha contas de cliente nessa conferência.
- Controller de cadastro usa tipo BOAS_VINDAS e inserção idempotente. O envio de e-mail de verificação permanece inalterado.

## E-mails

O usuário quer manter o comportamento do PetFlow, acrescentando o sino. E-mails existentes de pagamento aprovado, saída para entrega, entregue e cancelamento foram preservados. Separação já gera sino, mas não tem e-mail específico no código atual. Não afirmar envio real validado: os testes usam mocks e nenhum e-mail foi enviado nesta etapa.

## CEP e frete

O usuário pediu validar CEP, preencher endereço e calcular frete sem cadastro. GET `/api/public/frete/cep/:cep` e POST `/api/public/frete/cotar` já permitem visitante. CEP usa ViaCEP/BrasilAPI; frete usa Google Routes, com tarifa até 1 km grátis e R$ 3 por quilômetro adicional ou fração. Não inventar distâncias nem trocar a tarifa para esconder falha de provedor.

- Consulta real sem login: CEP `09060820` retornou HTTP 200 e Avenida Novo Horizonte, Vila Sacadura Cabral, Santo André/SP. CEP incompleto retornou 400 e inexistente 404.
- A falha inicial de consulta era bloqueio de rede externa no servidor iniciado dentro do sandbox (`EACCES` em ambos os provedores). O processo iniciado por esta retomada foi encerrado e reiniciado com permissão de rede. Sessões antigas 69143/97136/38899 foram substituídas pela 25874 ao carregar as chaves separadas. Não iniciar duplicatas ou encerrar processos do usuário.
- Carrinho busca automaticamente ao completar oito dígitos, mantém máscara depois da consulta, preserva número/complemento e descarta respostas antigas. Botão indica busca em andamento; resposta automática não rouba foco de outro campo. UF inválida é barrada antes de cotar. Formulário continua editável para CEP genérico ou falha externa.
- Produtos sem foto ou com falha de carregamento mostram `Sem foto`, substituindo o fallback incorreto de ração.
- Histórico resolvido: cotação inicialmente retornava 503 por Google403 e, depois de edição incorreta do `.env`, Google400/API_KEY_INVALID. Após a correção final e reinício, houve DUAS cotações reais válidas HTTP200, conforme ponto de parada acima. Testes automatizados de distância/tarifa/token usam respostas simuladas; os dois testes manuais da API usaram Google real.
- Usuário confirmou acesso ao Google Cloud e quer ajuda. As chaves fornecidas já são as configuradas no `.env`; não copiá-las para código, docs ou respostas. Routes API está permitida na chave e ativada, segundo o usuário. Faturamento ainda não foi conferido; tipo de restrição da aplicação ainda não foi informado. Verificar o projeto correto, faturamento e restrição pelo IP público de saída do servidor. Guia em `docs/CONFIGURAR-GOOGLE-MAPS.md`. Recomendada substituição das chaves enviadas no chat, verificando antes outros projetos que possam usá-las.

Cache do carrinho: cart.js/cart-storefront.css/public-header.js v20261021-1. Notificações CSS/JS v20261021-1 em todas as páginas públicas.

Esclarecimento posterior: usuário ainda não criou projeto específico do Nação Animal no Google Cloud e pensava ser necessário publicar primeiro no Railway. Foi esclarecido que os testes podem ser locais. Projeto proprietário das chaves atuais não foi confirmado; configurar o existente ou criar um separado, com faturamento, Routes API, Maps JavaScript API e duas chaves restritas. Não tratar ausência do nome Nação Animal como causa comprovada do 403.

## Verificação já concluída

65 testes pertinentes de catálogo, cabeçalho, home/carrossel, notificações, e-mails simulados, CEP/carrinho/frete e rotas passaram na conferência final. Além deles, o teste real de boas-vindas no PostgreSQL passou em schema temporário isolado, sem modificar leitura de contas reais. Links estáticos passaram em 38 páginas. `/produtos` e API responderam HTTP 200 com seis produtos e seis fotos. Revisão independente do sino/migração não encontrou problema bloqueante; revisão de fonte, sem QA visual.

## Preservar

Visual, carrossel automático sem botão de pausa, banner original Dog Walker, seis produtos [TESTE] e suas imagens, IDs/forms/checkout, dados e mudanças do usuário. Pagamentos continuam desativados; não ativar cobrança. Nada de commit/push/deploy sem pedido. Não imprimir segredos. Inspeção visual do navegador continua bloqueada; não contornar com outra ferramenta.

Servidor local iniciado nesta retomada com `npm run dev`, porta 4600. Pode já estar aberto; não iniciar duplicatas nem parar processos do usuário. Para fontes e decisões anteriores, ler `CONTINUAR-RECONSTRUCAO-04.md` e `IMAGENS-PRODUTOS.md`.
