# Continuidade — configuração do mapa no Google Cloud — 24/10/2026

Prevalece sobre o registro16 para configuração Google, permissões de navegação e resultado do teste físico.

## Configuração concluída

Usuário autorizou explicitamente acessar seu computador/navegador e configurar as APIs. O Chrome não apareceu no inventário da ferramenta; o Google Cloud foi aberto no navegador integrado, já autenticado no projeto **nacao-animal**. Não houve bloqueio dessa página nem contorno do bloqueio anterior de inspeção do site local.

- **Maps JavaScript API** já estava ativada no projeto; não foi necessário ativá-la.
- Chave **Nação Animal - Navegador** comparada em memória com a chave local por SHA-256: iguais. Nenhum valor de chave foi exibido no relatório ou gravado em documentos.
- Restrição de aplicação **Sites / Referenciadores HTTP** mantida.
- Referenciadores salvos: `https://nacao-animal-production.up.railway.app`, `https://nacao-animal-production.up.railway.app/*`, `http://localhost:4600`, `http://localhost:4600/*`, `http://127.0.0.1:4600`, `http://127.0.0.1:4600/*`.
- Entrada inadequada com `www` substituída pela origem HTTPS do Railway. Não foi liberado qualquer domínio genérico.
- Chave do navegador antes permitia32APIs; agora permite somente **Maps JavaScript API**. Não alterar a chave do servidor para resolver a exibição do mapa.
- Após salvar, reaberta a chave e conferida persistência das seis entradas e da única API permitida. Google informa propagação de até5minutos.

Não atribuir a falha anterior com certeza à ausência do curinga: a mensagem era gm_authFailure genérica e a política strict-origin-when-cross-origin já estava correta. Faturamento não foi alterado nem confirmado pelo painel nesta rodada.

## Validação e próximo passo

`node scripts/check-railway-gps.js` aprovado em modo somente leitura: health/banco saudáveis, páginas de entregador/cliente/admin200HTTPS, headersMaps/referrer corretos, chave pública igual à variável remota e chave do servidor não exposta. Sem chamada de rota, pedido, pagamento ou gravaçãoGPS.

Em24/10, o usuário retornou com nova captura do teste no celular. A tela confirma **GPS obtido com precisão4m, mapa carregado e rota calculada**, com linha azul/ciano e seta de localização visíveis. O botão X também aparece inteiro, confirmando a correção visual anterior. Portanto **GPS físico, autenticação/exibição do Maps JavaScript no Railway e rota até a loja foram validados no aparelho**. Não copiar ruas, coordenadas ou trajeto pessoal da captura para documentos/logs nem versionar a imagem.

A captura estática mostra velocidade0: não comprova atualização em movimento, avanço de manobras, recálculo após desvio ou latência. A entrega comercial com compartilhamento entre entregador, cliente e administrador continua pendente de validação autorizada. O diagnóstico `/admin/testar-gps` não cria pedido nem gravaGPS. Não insistir em repetir o teste parado já aprovado. Após futuras alterações de permissão, recarregar antes do clique porque o loader guarda falha de autenticação até atualizar. Não pedir coordenadas.

Deploy CSS `8f7cc110-e78a-4bf5-939e-2acf753c7fe0` já estava SUCCESS e CSS remoto/hash conferidos; corrige botão X cortado. Não houve novo deploy nesta rodada, pois as alterações foram somente no Google Cloud e nestes registros.

Continuam sem validação a entrega comercial entre aparelhos, pagamentos, GPS em segundo plano e trânsito em tempo real. Preserve dados/chaves locais, pagamentos desativados e futura produção limpa na Vixpi.

### Próxima etapa combinada com o usuário

Após aprovar a imagem, o usuário autorizou avançar para movimento e acompanhamento. Foi enviado o roteiro do percurso no celular pela página `/admin/testar-gps`, mas ele respondeu **“Vou fazer esse percurso depois”**. O movimento continua pendente; não repetir a solicitação até ele retomar.

Nova consulta autenticada somente leitura ao Railway confirmou **zero pedidos, zero em SAIU_PARA_ENTREGA e pagamentos desativados**. Não foi criado cliente, pedido, pagamento ou posição, nem alterado status. Não há pedido atual para abrir rastreamento comercial. O diagnóstico não compartilha a posição com cliente/admin e só recalcula manualmente a cada60s; não apresentá-lo como teste desses fluxos.

Quando retomar: primeiro confirmar movimento/avanço da distância no diagnóstico existente; depois preparar um pedido de teste no fluxo autorizado, em ambiente apropriado, para validar as páginas de entregador, cliente e administrador. Não simular pagamento aprovado ou alterar o banco remoto para fingir uma compra real. Roteiro de aceitação salvo em `docs/GPS-ENTREGAS.md`.

## Servidor local

Ao retomar, localhost estava indisponível e não havia processo servindo a porta4600. Iniciado `npm run dev`, sessão37392; health confirmado HTTP200 com banco connected. Conferir health antes de iniciar outra instância. Git estava sem alterações antes de atualizar estes documentos; commits podem ter sido feitos pelo usuário desde o registro16. Alterações documentais verificadas com git diff --check, sem erros.

Referências oficiais: https://docs.cloud.google.com/docs/authentication/api-keys#adding_application_restrictions e https://developers.google.com/maps/documentation/javascript/error-messages.
