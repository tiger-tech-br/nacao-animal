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

1. No painel, abra **Pedidos** e selecione o pedido autorizado para entrega. Marque **Saiu para entrega**.
2. Nos detalhes, em **GPS da entrega**, clique em **Gerar link para o entregador** e use **Compartilhar com entregador** ou **Copiar link**. Envie somente ao responsável por aquela entrega. Cada link vale 12 horas; gerar outro invalida o anterior e remove a posição e a rota anteriores.
3. O entregador abre o link completo em um navegador do celular, por HTTPS, toca em **Iniciar viagem** e permite a localização. Mantenha a localização do aparelho ativa, a página visível, a tela acesa e a conexão com a internet.
4. O mapa e as manobras acompanham cada nova posição recebida do aparelho, antes de aguardar a rede. O compartilhamento envia apenas a posição mais recente no máximo a cada 2 segundos, sem envios simultâneos. O mapa mostra uma seta para o entregador, a linha da rota, partida e destino, além das orientações e estimativas disponíveis. O trajeto usa o endereço salvo no pedido; alterar o perfil do cliente depois da compra não muda o destino.
5. O cliente entra na conta e abre o rastreamento por **Meus pedidos**, pela notificação ou pelo link do e-mail. O administrador usa **Acompanhar entrega** nos detalhes do pedido. Ambos veem a última posição recebida e a rota; o GPS deles não é solicitado.
6. Ao concluir, o administrador marca **Entregue**, encerrando o acesso e removendo a posição e a rota. O entregador também pode usar **Parar e encerrar compartilhamento**. Fechar a página interrompe os envios, mas não conclui o pedido nem revoga o link automaticamente.

## Testar no celular sem criar pedido

Após entrar no painel administrativo no próprio navegador do celular, abra `/admin/testar-gps` na mesma aba. A página confere a sessão com o servidor; somente administradores e gerentes podem usar o teste. Sem sessão, aparece um link para entrar no painel e voltar automaticamente ao teste; a localização não é solicitada antes da autenticação e do toque em testar.

Leia o aviso e toque em **Testar GPS e navegação**. O teste solicita a permissão do aparelho e calcula um trajeto da sua posição até a loja. As coordenadas são processadas pelo Google para o mapa e a rota, mas este diagnóstico não grava a posição no banco nem cria clientes, compras, pagamentos ou entregas. O resumo informa se o GPS foi obtido, a precisão aproximada, o carregamento do mapa e o cálculo da rota, sem mostrar coordenadas numéricas.

O mapa e as orientações acompanham as novas posições recebidas do aparelho antes de aguardar a resposta da consulta de rota. Há uma consulta inicial quando o GPS está recente e com precisão de até 100 m. O botão **Recalcular rota de teste** solicita outro trajeto manualmente, com intervalo mínimo de um minuto; o teste não recalcula rotas automaticamente. Enquanto o Google responde, o GPS continua atualizando nesta tela.

No modo de seguir posição, a seta fica centralizada e o mapa se desloca por baixo dela. **Ver rota completa** desliga essa centralização para observar a seta avançando no trajeto; arrastar ativa o mapa livre. O indicador local mostra precisão, idade da leitura e **deslocamento estimado em linha reta desde o início**, calculado só com coordenadas recebidas, sem somar rotação ou passagem do tempo. O valor pode variar com o erroGPS e não representa a distância total percorrida. Após15s sem leitura recente, aparece aviso de falta de atualização. Tudo é limpo ao encerrar/ocultar.

Toque em **Parar teste** para interromper a localização e limpar o mapa e os dados em memória. Ocultar a página, trocar de aplicativo ou voltar pelo histórico pausa o teste; para continuar, toque em **Retomar teste**. Nenhuma posição é salva em armazenamento do navegador. Em24/10/2026, o usuário confirmou no celular GPS com precisão4m, mapa carregado e rota desenhada. Essa captura parada não valida movimento ou compartilhamento de uma entrega.

## Roteiro de validação pendente

O percurso em movimento foi adiado pelo usuário. Quando ele retomar, usar o diagnóstico existente com a página visível e a tela ativa durante um pequeno trecho a pé. Conferir se a seta acompanha a posição, se a distância até a manobra muda e se as instruções avançam ao chegar à manobra. Depois encerrar e conferir que o teste limpa a posição. Não pedir coordenadas nem registrar ruas ou o trajeto pessoal no relatório. O recálculo deste diagnóstico é manual; não usá-lo como evidência do recálculo automático da viagem comercial.

Para o acompanhamento entre aparelhos, é necessário um pedido de teste autorizado que passe pelo fluxo de entrega. A última consulta ao Railway em24/10 retornou zero pedidos e pagamentos desativados. Preparar o cenário apropriado antes de iniciar; não forçar pagamento ou status no banco da demonstração.

Com esse cenário pronto, abrir o link privado atual no celular do entregador; no segundo aparelho, o cliente autenticado abre o próprio pedido e o administrador usa **Acompanhar entrega**. Confirmar posição e rota em ambos, atualização durante o movimento e aviso de última posição conhecida após15s sem dados recentes. Por fim, conferir encerramento e remoção do rastreamento. Cada resultado deve ser registrado separadamente; a aprovação do mapa parado não comprova esses passos.

## Uso no celular

A localização exige um contexto seguro e a permissão do usuário, conforme a [documentação da Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API). Use o link HTTPS do Railway no celular. O endereço HTTP do computador na rede local pode abrir a loja, mas não habilita o GPS no navegador do celular. `localhost` se refere ao próprio aparelho que abre a página.

O navegador pode suspender o envio quando a tela é bloqueada ou a página vai para segundo plano. Na viagem de uma entrega já autorizada, voltar à mesma aba pode retomar a captura; voltar pelo histórico exige tocar em **Retomar viagem**. No diagnóstico sem pedido, ocultar a página sempre exige **Retomar teste**. O site tenta manter a tela acesa quando o aparelho oferece esse recurso. O rastreamento não é um aplicativo nativo com localização contínua em segundo plano.

As estimativas de duração e chegada não consideram trânsito em tempo real. A posição não é simulada. Posição antiga ou imprecisa interrompe as orientações; após 15 segundos sem atualização, o acompanhamento informa que a posição está desatualizada.

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
