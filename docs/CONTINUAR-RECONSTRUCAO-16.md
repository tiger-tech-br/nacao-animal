# Continuidade — navegação contínua e teste físico — 23/10/2026

Prevalece sobre15/14 para GPS. Usuário autorizou validar GPS físico e confirmou estar com o celular disponível. Depois esclareceu que quer navegação em tempo real (percebia atraso5s) e perguntou pela linha azul de partida/destino semelhante à referência visual de navegação. Foi explicado: verde partida GPS, laranja destino, linha azul trajeto e seta posição real.

## Situação humana/loja

Consulta autenticada remota retornou ZERO pedidos, pagamentos continuam desativados. Não existe entrega legítima para gerar token. Não foi criado pedido nem forçado pagamento/status. Para validar o aparelho sem compra, foi implementado diagnóstico privado que usa GPS real e rota ATÉ A LOJA; não equivale a uma entrega comercial nem comprova compartilhamento entre cliente/entregador. Teste físico ainda depende de o usuário abrir a página, clicar e autorizar GPS; não alegar aprovação antes do retorno humano.

### Resultado físico recebido depois da publicação

O usuário abriu no celular e informou GPS funcionando, mas mapa/rota com falha. Logs filtrados apenas por método/status (sem coordenadas) confirmaram POST /api/gps-diagnostico/rota HTTP200 do teste humano. A imagem enviada depois confirmou GPS com **precisão9m**, **rota calculada** e instruções/distância/tempo, mas o aviso **O Google recusou o mapa**. Portanto GPSfísico e Routes no servidor foram confirmados; renderização Maps JavaScript ainda NÃO validada. Não copiar ruas/coordenadas pessoais da imagem para documentos ou logs.

Usuário não encontrou onde ativar/configurar. Foi enviado link https://console.cloud.google.com/apis/library/maps-backend.googleapis.com com instrução selecionar o projeto da chave do navegador. Pergunta assíncrona atual: aparece Ativar (clicou), Gerenciar, ou não conseguiu abrir/selecionar projeto? Aguardar resposta. Depois conferir Credenciais > chave de GOOGLE_MAPS_BROWSER_API_KEY > Restrições de API > Maps JavaScript API permitida, além do domínio já confirmado pelo usuário. Fonte oficial: https://developers.google.com/maps/documentation/javascript/error-messages e /get-api-key. Não há CLI Google Cloud disponível nem acesso autorizado ao painel por ferramentas; não contornar bloqueio anterior de navegador.

Uma mudança de permissão Google exige RECARREGAR a página do teste antes de tentar novamente: loader guarda authenticationError até recarregar. Não basta só tocar Retomar. Não afirmar qual erro específico de permissão ocorreu (API não ativa, chave bloqueada, domínio/faturamento) sem nova evidência; a captura só mostra gm_authFailure genérico.

## Navegação e acompanhamento

- driver.js usa watchPosition com alta precisão/maxAge0. Cada fix fresco move seta e atualiza manobras localmente antes de esperar rede.
- Publicação independente no máximo a cada2s, fila só último fix fresco, sem concorrência/repetir timestamp ou resposta antiga recuar posição. Falha de envio avisa sem suspender navegação local.
- CapturadoEm ISO carrega hora do sensor; timeoutPOST5s e abort/parada protegidos por geração. Servidor aceita campo opcional para compatibilidade, recusa leitura>30s/futuro>5s e grava hora real em atualizado_em, evitando rede lenta parecer GPSnovo.
- GPS>15s ou precisão>50m suspende orientações, sem inventar movimento; somente dados reais alteram progresso. Visibilidade/encerramento limpa watch; BFCache exige Retomar. Navegador não garante captura em segundo plano.
- tracking.js cliente/admin consulta2s, alerta de posição antiga após15s. Não confundir com frequência nativa do sensor; depende do aparelho/conexão.
- Navegação reavalia validade da leitura1s; atualizações de posição são imediatas. navigation-engine preserva velocidade estimada ao renderizar mesma leitura e continua invalidando GPSvelho.
- Recalcular após desvio mantém duas posições válidas fora da rota, cliente limita16s/servidor15s. Rota estável renova5min. Não chamaGoogle em cada fix. Tempo/chegada sem trânsito em tempo real.
- Limite global de endpoints realtime ajustado240/min/IP para os fluxos2s; demais limites mantidos.

## Diagnóstico físico privado

- GET /admin/testar-gps serve views/delivery/gps-test.html, CSP/Referrer Maps/no-store. JS gps-test.js valida GET /api/auth/me antes de solicitar GPS; ADMIN/GERENTE. Botão explica processamento de posição pelo Google e ausência de pedido/gravação GPS.
- Login administrativo aceita retorno SOMENTE next=/admin/testar-gps, demais destinos seguem dashboard; versão login.js atualizada no HTMLadmin. O link na página leva ao login e retorna automaticamente ao teste.
- watchPosition renderiza mapa/manobras imediatamente. UMA consulta inicial e recálculo manual mínimo60s; sem loop pago/desvio automático neste diagnóstico. Parar/hidden/pagehide limpa watch, mapa, memória/abort; Retomar teste exige clique.
- POST /api/gps-diagnostico/rota, authMiddleware + ADMIN/GERENTE e limite4/min: recebe latitude/longitude/precisao/timestamp, GPS<=30s/futuro5s/precisão<=100m. SELECT somente empresa da sessão, destino é endereço da loja, chama entregaRotaService existente. Sem SQLmutação, cliente, pedido, pagamento ou armazenamento de localização; erros sanitizados sem logGPS/credenciais.
- Resposta de rota contém coordenadas e trajeto para o próprio celular autenticado (TLS/no-store), não copiar para chat/docs. Diagnóstico não transmite GPS em loop para loja, somente posição inicial/recalculo ao Google pelo servidor.

Arquivos principais novos: controllers/gpsDiagnosticController.js, routes/gpsDiagnosticRoutes.js, services/gpsTimestamp.js, public/js/pages/delivery/gps-test.js, views/delivery/gps-test.html e testes correspondentes. app.js monta endpoints e securityMiddleware inclui páginaMaps. Readme/docs/views acompanham2s/15s e GPScontínuo.

## Validações já feitas

- Suíte completa:455 testes,451 aprovados,0falhas,4integrações ignoradas.
- Backend integração PostgreSQL local em schema temporário isolado aprovado, incluindo rejeição capturaGPSantiga/preservaçãohora real. Provedores simulados; schema removido. Sem dados reais alterados.
- Links estáticos aprovados41páginas e diff sem erros.
- Sem inspeção de navegador (bloqueio anterior continua, sem contorno via CUA/CDP). Sem teste físico ainda, nenhum GPSde pessoa foi obtido pelo agente.
- Preservadas chaves, .env, pagamentosfalse/sandbox e contas administrativas. Sem e-mails/cobranças, sem migração nova.

## Publicação atual

Upload CLI concluído para o mesmo projeto/serviço/ambiente do registro14: deploy **9245b308-8125-496e-8240-9ca06c9356cf — SUCCESS**. Página de teste e seis JS servidos200, hashesSHA256 idênticos aos locais. Endpoint diagnóstico sem autenticação retornou401, como esperado. Último deployGPS anterior64b7e7fa... permanece referência de rollback.

A imagem humana também revelou botão X cortado na lateral. Corrigido CSS: removido transform do contêiner dos controles para que o botão position:fixed se ancore à viewport; grupo lateral usa top/bottom/justify-content e pointer-events adequados. Sem alterar JS/negócio. Novo upload CSS **8f7cc110-e78a-4bf5-939e-2acf753c7fe0**, ainda precisa conferir status final/hash. Não houve teste visual por ferramenta; achado vem da imagem do usuário e do CSS.

Site https://nacao-animal-production.up.railway.app/ ; teste físico https://nacao-animal-production.up.railway.app/admin/testar-gps já publicado. Link enviado ao usuário para abrir no próprio celular, entrar no admin se necessário, tocar Testar GPS e navegação e permitir localização. Pergunta assíncrona de resultado GPS/mapa/rota está pendente; não confundir publicação/testesautomatizados com aprovação física. Não pedir coordenadas. Validação de entrega entre aparelhos continua pendente de pedido legítimo ou ambiente isolado.

Alterações atuais ainda sem commit/push (base96347c4). Upload CLI contém working tree; futuro autodeploy GitHub precisa incluir arquivos. Preservar alterações e não limpar/remover contas. Local deve continuar disponível; última sessão8952, confirmar antes de iniciar duplicata. Demais pendências/restriçõesVixpi/Railway nos registros15/14/13.
