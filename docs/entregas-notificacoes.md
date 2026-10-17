# Entregas, Google Maps e notificações

## Configurar o mapa no Railway

O servidor calcula as rotas com `GOOGLE_MAPS_API_KEY` (Routes API, já usada pelo frete). O mapa visível no navegador usa uma chave **separada**, `GOOGLE_MAPS_BROWSER_API_KEY`.

1. No mesmo projeto do Google Cloud com faturamento habilitado, abra **APIs e serviços → Biblioteca → Maps JavaScript API → Ativar**.
2. Em **APIs e serviços → Credenciais → Criar credenciais → Chave de API**, crie a chave do navegador.
3. Edite essa chave: **Restrições de aplicativos → Sites**. Autorize `https://petflow-v2-production.up.railway.app/*` e o domínio próprio, se existir. Para testar localmente, inclua a origem/porta local utilizada.
4. Em **Restrições de API**, permita apenas **Maps JavaScript API**.
5. No Railway, serviço da **aplicação**, ambiente de produção, salve `GOOGLE_MAPS_BROWSER_API_KEY` com essa chave e aplique o deploy. Não substitua `GOOGLE_MAPS_API_KEY` pela chave do navegador.
6. Faça commit/deploy deste código. O `preDeployCommand` existente executa `npm run db:migrate`, incluindo `109_notificacoes_entregas.sql`. Não é necessário executar SQL manualmente no pgAdmin quando esse comando termina com sucesso.

Não coloque a chave privada de Routes em HTML. A chave do navegador é pública por natureza e deve ter as restrições de site/API acima. A variável foi deixada vazia no `.env` local e no exemplo; a chave real deve ser cadastrada pelo responsável no Google Cloud/Railway.

Referências oficiais: [carregar Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/load-maps-js-api), [restringir chaves](https://developers.google.com/maps/api-security-best-practices), [política de conteúdo](https://developers.google.com/maps/documentation/javascript/content-security-policy).

## Usar a entrega

1. Em **Administração → Pedidos**, abra o pedido pago. Atualize para **Preparando** e depois **Saiu para entrega**.
2. O cliente recebe uma notificação salva e o e-mail com **Rastrear pedido**. O e-mail depende do Resend configurado. A notificação no site independe do sucesso do e-mail.
3. Na seção **GPS da entrega**, gere o link. Use **Compartilhar com entregador** ou **Copiar link**. O link é privado do entregador, vale 12 horas e dá acesso apenas a essa entrega. Gerar outro revoga o anterior e limpa a posição/rota anterior.
4. O entregador abre o link no próprio celular e toca **Iniciar viagem**, permitindo GPS. A tela entra em modo de navegação com mapa escuro em tela cheia, painel da próxima manobra, indicação da manobra seguinte, linha azul, velocidade, distância restante, previsão de duração e horário estimado de chegada. Uma **seta azul sempre visível** acompanha a posição recebida. A direção vem do GPS ou de deslocamento suficiente para estimá-la; sem nova direção, a seta mantém a última conhecida. Antes da primeira direção, fica voltada para cima, com aviso. A rota parte da posição GPS usada no último cálculo e termina no endereço salvo na compra. **Centralizar em mim** acompanha a posição; **Ver rota completa** enquadra partida, destino e trajeto. O botão de voz lê as orientações quando o navegador oferece síntese de voz e a página está visível. Tudo fica dentro da PetFlow, sem abrir o aplicativo Google Maps. O destino não muda se o cliente editar o perfil depois. Para calcular o **frete**, a origem continua sendo **Avenida Novo Horizonte, 123, Vila Sacadura Cabral, Santo André, SP, Brasil**, configurável por `DELIVERY_ORIGIN_ADDRESS`.
5. O cliente entra na conta usada na compra e abre **Rastrear pedido** pelo e-mail, pelas notificações ou por **Meus pedidos**. Ele vê a **van na posição do entregador, a linha azul da rota, o ponto verde da partida e o ponto laranja do endereço da entrega**. O mapa enquadra a van e o destino conforme o GPS avança; se o cliente arrastar o mapa, o acompanhamento automático pausa até ele tocar em **Centralizar**. Um cartão mostra distância, duração estimada, previsão de chegada e horário da última posição. **Expandir** abre o mapa em tela cheia. A rota aparece após o Google localizar o destino e calcular o trajeto. O login iniciado pelo rastreamento retorna à mesma entrega.
6. Para acompanhar no painel, o administrador ou gerente abre o pedido em **Saiu para entrega** e clica em **Acompanhar entrega**, na seção **GPS da entrega**. A página mantém o mapa integrado ao resumo, com opção de expansão, e mostra a mesma van, rota, estimativas e destino vistos pelo cliente, sem solicitar nem transmitir o GPS do administrador. Não é preciso gerar outro link. Antes do entregador compartilhar sua posição, aparece um aviso de espera. O acompanhamento exige uma sessão administrativa da mesma loja.
7. O administrador marca **Entregue** ao concluir. O servidor revoga o link e remove a posição e a rota; o mapa de acompanhamento é ocultado. O entregador também pode encerrar antes pelo botão **Parar e encerrar compartilhamento**.

O GPS é enviado e consultado a cada 5 segundos em páginas visíveis; as notificações são consultadas a cada 15 segundos. Os marcadores e o progresso da navegação mudam somente conforme coordenadas reais recebidas; não simulam deslocamento. A Routes API fornece as etapas e manobras em português. A tela do entregador projeta o GPS sobre essas etapas para selecionar a orientação atual, interrompe instruções com posição antiga ou imprecisa e pede novo trajeto após duas posições consecutivas fora da rota. A linha da rota aparece para entregador, cliente e administrador; ela é refeita a cada 5 minutos ou quando o entregador sair do trajeto, respeitando o limite de uma consulta por minuto. Tempo e chegada são estimativas sem trânsito em tempo real.

O entregador precisa manter a página aberta, GPS permitido e conexão ativa. Há tentativa de manter a tela acesa quando o navegador oferece essa função. Tela bloqueada/segundo plano pode interromper posição, orientação visual e voz; o cliente recebe aviso de posição antiga após 2 minutos. A tela web oferece orientação por etapas, mas não substitui as garantias de uma Navigation SDK nativa. Navegação contínua em segundo plano exige aplicativo Android/iOS com as permissões apropriadas.

Sem a chave do navegador, o mapa interno apresenta aviso de configuração; a transmissão de coordenadas continua funcionando. Falha ao consultar a rota não interrompe o GPS. Pedidos antigos sem endereço de entrega salvo não têm rota automática confiável.

## Notificações

Novas contas geram aviso persistente no painel. Novos pedidos mantêm seus avisos administrativos. Todas as mudanças efetivas de status geram avisos para o cliente, na mesma transação do pedido, inclusive alterações pelo pagamento. Repetir o mesmo status não duplica avisos.

No painel administrativo, as notificações ficam no sino existente do cabeçalho, sem botão extra ou flutuante. Nas páginas públicas, ficam disponíveis com sessão iniciada. Mostra até 100 avisos recentes. **Marcar exibidas como lidas** grava somente os avisos apresentados; a leitura administrativa é individual. Não são notificações push fora do site. O histórico começa após instalar a migração, sem enviar avisos retroativos de cadastros antigos.

## Verificação

Os testes de integração usam PostgreSQL local em schema descartável e Google/Resend/PagBank simulados. Cobrem cadastro revertido, avisos por empresa/cliente, leitura persistente, status concorrentes, rota no endereço salvo, limite de consultas, troca/revogação de links e reaplicação das migrações. Os testes de navegador simulam GPS, início/encerramento, permissão negada, posição antiga e atualização do mapa. A validação visual com a chave real e dois aparelhos precisa ser realizada após configurar e publicar.
