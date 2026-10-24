# GPS das entregas — Nação Animal

O entregador compartilha a posição pelo celular. O cliente acompanha o próprio pedido após entrar na conta; o administrador acompanha a mesma entrega pelo painel, sem compartilhar a localização dele. A página pública de rastreamento não fornece acesso aos pedidos de outras pessoas.

## Preparação do mapa

Use duas chaves separadas no serviço da aplicação do Railway:

| Variável | Uso | Configuração no Google Cloud |
| --- | --- | --- |
| `GOOGLE_MAPS_BROWSER_API_KEY` | Mapa no navegador | Maps JavaScript API habilitada; restrição de aplicação por sites e de API somente para Maps JavaScript API |
| `GOOGLE_MAPS_API_KEY` | Cálculo do frete e das rotas pelo servidor | Routes API habilitada; restrição de API para Routes API e restrição por IP compatível com o IP público de saída do servidor |

O projeto Google Cloud precisa de faturamento ativo. A chave de servidor não deve ser colocada em páginas públicas. A chave do navegador fica visível ao navegador e precisa das restrições de aplicação/API. Essas recomendações seguem a [orientação de segurança do Google Maps](https://developers.google.com/maps/api-security-best-practices) e a [configuração da Routes API](https://developers.google.com/maps/documentation/routes/get-api-key).

Nos sites autorizados da chave do navegador, inclua:

- `https://nacao-animal-production.up.railway.app/*`
- `https://nacao-animal-production.up.railway.app`
- `http://localhost:4600/*`
- `http://localhost:4600`
- `http://127.0.0.1:4600/*`
- `http://127.0.0.1:4600`
- O domínio definitivo, quando for publicado, preservando os endereços ainda utilizados.

No Railway, `APP_URL` deve ser `https://nacao-animal-production.up.railway.app`, para gerar os links da demonstração. A configuração remota deve preservar o `.env` usado pelo localhost. Ativar o mapa não ativa pagamentos.

## Operação da entrega

1. No painel, abra **Pedidos**, selecione o pedido autorizado e marque **Saiu para entrega**. A loja utiliza o carro do próprio dono; não há cadastro ou seleção de entregador.
2. Nos detalhes, em **GPS da entrega**, clique diretamente em **Gerar link para o entregador**. Use **Compartilhar com entregador** ou **Copiar link**. O servidor configura a viagem para carro. Cada link vale12horas; gerar outro invalida o anterior e remove a posição e a rota anteriores.
3. O entregador abre o link completo em um navegador do celular, por HTTPS, toca em **Iniciar viagem** e permite a localização. Mantenha a localização do aparelho ativa, a página visível, a tela acesa e a conexão com a internet.
4. O mapa e as manobras acompanham cada nova posição recebida do aparelho, antes de aguardar a rede. O compartilhamento envia apenas a posição mais recente no máximo a cada 2 segundos, sem envios simultâneos. O mapa mostra uma seta para o entregador, a linha da rota, partida e destino, além das orientações e estimativas disponíveis. O trajeto usa o endereço salvo no pedido; alterar o perfil do cliente depois da compra não muda o destino.
5. O cliente entra na conta e abre o rastreamento por **Meus pedidos**, pela notificação ou pelo link do e-mail. O administrador usa **Acompanhar entrega** nos detalhes do pedido. Ambos veem a última posição recebida e a rota; o GPS deles não é solicitado.
6. Ao concluir, o administrador marca **Entregue**, encerrando o acesso e removendo a posição e a rota. O entregador também pode usar **Parar e encerrar compartilhamento**. Fechar a página interrompe os envios, mas não conclui o pedido nem revoga o link automaticamente.

## Simular percursos sem celular

Abra `/admin/simular-navegacao` e entre no painel administrativo. Somente administradores e gerentes podem executar os percursos. Escolha curvas/chegada, desvio/recálculo, perda de sinal/retomada, passos curtos/retorno ou condução até30/50/80km/h e clique em **Executar percurso**. A reprodução é automática, com pausa, avanço por ponto e reinício. Nos percursos de condução há curvas com redução de velocidade, parada e retomada, além de intervalos variáveis entre leituras.

O simulador usa os mesmos componentes de mapa e navegação da entrega, com posições artificiais claramente identificadas. Não solicita a localização do aparelho, não cria pedidos e não publica GPS em uma entrega. Recálculo é local; o mapa Google é carregado para visualizar o teste, sem chamar Routes API a cada ponto. Resultado de chegada ou falha aparece na tela.

Os quatro percursos foram concluídos no navegador com o mapa Google real. Os testes automatizados também verificam manobras, voz, retorno, cruzamentos, sinal, progresso e chegada. Essa é a primeira ferramenta para investigar falhas de lógica; teste físico fica para o sinal/permissões do aparelho e uma confirmação curta do trajeto.

Na revisão de fluidez, os sete percursos passaram nos testes automatizados com os componentes de produção; os novos percursos de 50 e 80 km/h também concluíram no navegador com o Google Maps real. A seta e a câmera usam uma animação visual coordenada de até 160 ms, encurtada em velocidade alta. O limite anterior era 320 ms. Uma leitura nova substitui a animação anterior; não há fila nem avanço além da última posição recebida. O GPS bruto continua atualizando as manobras e o compartilhamento sem esperar essa animação. Perda de sinal, pausa e ocultação cancelam movimentos pendentes. O simulador mostra os tempos de recepção/desenho e a diferença visual, sem usar o GPS do aparelho.

A revisão seguinte acrescentou um oitavo percurso, **GPS irregular · caminhada**, com leituras a cada3/5s, precisão8/20m, velocidade ausente/zero e idade2s. Todos os oito passam com os componentes de navegação. A apresentação agora suaviza leituras com intervalo de até5s e idade até3s; velocidade zero isolada não impede o movimento observado. Essas condições afetam apenas a animação curta, mantendo as regras de validade do GPS e nenhuma previsão de posições futuras.

## Testar no celular sem criar pedido

Após entrar no painel administrativo no navegador do celular, abra `/admin/testar-gps`. O teste usa rota de carro até a loja e funciona sem cadastro de entregador, compra, pedido ou mudança de status. A seta acompanha a posição real inclusive enquanto você caminha; o perfil de carro define as vias da rota. Somente administradores e gerentes podem usar o teste. Sem sessão, o login retorna ao diagnóstico. A localização só é solicitada após autenticação e toque em testar.

Leia o aviso e toque em **Testar GPS e navegação**. O teste solicita a permissão do aparelho e calcula um trajeto da sua posição até a loja. As coordenadas são processadas pelo Google para o mapa e a rota, mas este diagnóstico não grava a posição no banco nem cria clientes, compras, pagamentos ou entregas. O resumo informa se o GPS foi obtido, a precisão aproximada, o carregamento do mapa e o cálculo da rota, sem mostrar coordenadas numéricas.

O mapa e as orientações acompanham as novas posições recebidas do aparelho antes de aguardar a resposta da consulta de rota. Há uma consulta inicial quando o GPS está recente e com precisão de até 50 m na tela. O teste recalcula automaticamente ao detectar desvio, respeitando intervalo mínimo de 16 segundos entre consultas. Uma espera pendente usa a posição mais recente e é cancelada ao parar, ocultar a página ou perder sinal. O botão **Recalcular rota de teste** também permite tentar novamente. Após uma falha do provedor, a tentativa automática fica bloqueada até a ação manual, evitando consultas repetidas. Enquanto o Google responde, o GPS continua atualizando nesta tela.

Quando o Google disponibiliza alternativas, elas aparecem em cinza no mapa da navegação; a opção ativa fica em azul/ciano. As informações da rota contêm a lista de alternativas, sem modal ou seletor de locomoção. A seleção do diagnóstico é local; a seleção da entrega comercial valida o identificador e a versão da lista no servidor, sem aceitar geometria enviada pelo navegador. O provedor pode retornar menos opções. As entregas e o diagnóstico usam o perfil de carro, conforme a operação informada pelo dono. O GPS não tenta inferir o transporte pela velocidade. Os avisos do provedor permanecem visíveis no resumo da navegação, inclusive fora da rota; rotas a pé, de bicicleta e de moto têm ressalvas de cobertura indicadas pelo Google. Em caminhada, um desvio preciso de20m já pode confirmar recálculo após duas leituras distintas; precisão pior aumenta a tolerância para evitar falso desvio.

No modo de seguir posição, a seta fica centralizada e o mapa se desloca por baixo dela. **Ver rota completa** desliga essa centralização para observar a seta avançando no trajeto; arrastar ativa o mapa livre. O indicador local mostra precisão, idade da leitura e **deslocamento estimado em linha reta desde o início**, calculado só com coordenadas recebidas, sem somar rotação ou passagem do tempo. O valor pode variar com o erroGPS e não representa a distância total percorrida. Após15s sem leitura recente, aparece aviso de falta de atualização. Tudo é limpo ao encerrar/ocultar.

Toque em **Parar teste** para interromper a localização e limpar o mapa e os dados em memória. Ocultar a página, trocar de aplicativo ou voltar pelo histórico pausa o teste; para continuar, toque em **Retomar teste**. Nenhuma posição é salva em armazenamento do navegador. Em24/10/2026, o usuário confirmou no celular GPS com precisão4m, mapa carregado e rota desenhada. Essa captura parada não valida movimento ou compartilhamento de uma entrega.

Após parar, **Qualidade do último teste** permite copiar um resumo técnico sem localização. Ele contém apenas contagens, intervalos, precisão e tempo de desenho; não contém coordenadas, horários absolutos, conta, endereço ou trajeto e não é enviado automaticamente. Novo teste, ocultação ou recarregamento limpa esse resumo. Durante a navegação, o indicador informa o intervalo entre leituras para diferenciar falta de atualização do sensor de atraso na apresentação.

## Roteiro de validação pendente

O usuário testou caminhando e confirmou que a seta melhorou bastante. Pediu resposta mais rápida ao deslocamento, semelhante à apresentação do simulador. Não solicitou opções de locomoção e rejeitou o modal acrescentado durante o trabalho; ambos foram removidos. O limite visual atual de 160 ms ainda precisa de nova confirmação física após a publicação. A frequência das leituras depende do aparelho/navegador e não pode ser garantida pela simulação. Não pedir coordenadas nem registrar ruas ou trajeto pessoal. Diagnóstico e viagem comercial recalculam com seus respectivos limites; o simulador valida o fluxo automático artificial.

Para o acompanhamento entre aparelhos, é necessário um pedido de teste autorizado que passe pelo fluxo de entrega. A última consulta ao Railway em24/10 retornou zero pedidos e pagamentos desativados. Preparar o cenário apropriado antes de iniciar; não forçar pagamento ou status no banco da demonstração.

Com esse cenário pronto, abrir o link privado atual no celular do entregador; no segundo aparelho, o cliente autenticado abre o próprio pedido e o administrador usa **Acompanhar entrega**. Confirmar posição e rota em ambos, atualização durante o movimento e aviso de última posição conhecida após15s sem dados recentes. Por fim, conferir encerramento e remoção do rastreamento. Cada resultado deve ser registrado separadamente; a aprovação do mapa parado não comprova esses passos.

## Uso no celular

A localização exige um contexto seguro e a permissão do usuário, conforme a [documentação da Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API). Use o link HTTPS do Railway no celular. O endereço HTTP do computador na rede local pode abrir a loja, mas não habilita o GPS no navegador do celular. `localhost` se refere ao próprio aparelho que abre a página.

O navegador pode suspender o envio quando a tela é bloqueada ou a página vai para segundo plano. Na viagem de uma entrega já autorizada, voltar à mesma aba pode retomar a captura; voltar pelo histórico exige tocar em **Retomar viagem**. No diagnóstico sem pedido, ocultar a página sempre exige **Retomar teste**. O site tenta manter a tela acesa quando o aparelho oferece esse recurso. O rastreamento não é um aplicativo nativo com localização contínua em segundo plano.

As estimativas de duração e chegada não consideram trânsito em tempo real. A posição não é simulada. Posição antiga ou imprecisa interrompe as orientações; após 15 segundos sem atualização, o acompanhamento informa que a posição está desatualizada.

Na revisão de24/10, a câmera passou a acompanhar a primeira coordenada diretamente, sem depender de rota pronta ou animações acumuladas. Leituras atrasadas/duplicadas não substituem o GPS mais recente; o cálculo de rota exige posição de até15s e precisão de até50m também no servidor. O mapa foi conferido com o Google real e posições artificiais controladas. Essa verificação e os testes automatizados passaram; a confirmação da câmera durante novo percurso físico ainda é necessária. Não tratar a comparação controlada como aprovação da entrega comercial.

## Quando algo não aparecer

| Situação | Conferir |
| --- | --- |
| Não aparece **GPS da entrega** no painel | O pedido precisa estar em **Saiu para entrega** |
| Link inválido ou expirado | Usar o link completo e atual; verificar se a entrega continua em andamento |
| GPS negado | Liberar localização para o site e para o navegador nas configurações do aparelho; tentar iniciar novamente |
| A posição chega, mas o mapa não carrega | Maps JavaScript API, faturamento, chave do navegador e domínio autorizado |
| O mapa aparece sem trajeto | Routes API, chave de servidor, endereço do pedido e posição recente do entregador |
| O mapa deixa de atualizar | Conexão, página visível e tela ativa no celular do entregador |

Falha no mapa ou na rota não deve ser confundida com falha no envio da posição. A configuração HTTP e os testes automatizados ajudam a verificar o sistema; a validação completa exige acompanhar uma entrega autorizada em celulares com permissão de localização. Não copie links privados de entrega, credenciais, senhas ou posições reais para documentos ou chats.
