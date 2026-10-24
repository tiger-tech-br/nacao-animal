# Continuidade — seta centralizada e diagnóstico de movimento — 24/10/2026

Prevalece sobre17/16 para o teste de movimento e a publicaçãoGPS atual. Configuração Google e aprovação do mapa parado do registro17 continuam válidas.

## Relato e investigação

Usuário testou o GPS e relatou que a seta gira ao mudar direção, mas não acompanha o deslocamento. Perguntado se o mapa se move por baixo da seta ou a distância da manobra diminui, respondeu **“Não reparei nesses detalhes”**. Portanto movimento físico ainda não foi validado, e não foi comprovado congelamento do sensor.

Revisão do código: o diagnóstico recebe latitude/longitude de cada watchPosition e atualiza mapa/manobras localmente, sem aguardar rede. Ao iniciar navegação, map.follow() centraliza a seta e panTo acompanha a coordenada: a posição geográfica e o centro avançam, mas a seta pode permanecer no mesmo pixel. Não foi encontrado filtro que congele o marcador; o limite50m afeta as orientações. Não alegar que o problema do aparelho foi corrigido só por essa revisão.

## Alterações publicadas

- `map.js`: callback opcional onViewChange({following,overview}); controles anunciam seguir localização, rota completa e mapa livre, com aria-pressed/título/rótulo coerentes. Lógica de coordenadas/câmera mantida.
- `gps-test.js`: mostra precisão, idade da última leitura e deslocamento estimado em linha reta desde a primeira posição com precisão<=50m. Só calcula usando GPS real; mudar direção ou passar o tempo não soma metros. Não equivale a distância total percorrida e pode variar com a imprecisão do GPS.
- Resumo reavaliado1s; se não houver leitura recente por15s, mostra aviso e pausa orientações. ErrosGPS persistem até novo sinal válido. Sem movimento ou progresso inventados.
- Modo atual explicado na tela: seguindo você (seta centralizada, mapa anda por baixo), rota completa (seta percorre o mapa), ou mapa livre. Sucesso da rota não deixa outro aviso permanente cobrindo o mapa.
- `gps-test.css` novo, restrito à página diagnóstica; HTML contém explicação e versões dos arquivos para atualizar cache.
- Encerrar/ocultar limpa timer/watch/posição/origem/indicadores em memória. Nenhum envio ou persistência adicional deGPS, consultaGoogle, pedido ou pagamento foi introduzido.

Arquivos alterados: public/js/pages/delivery/map.js, gps-test.js, views/delivery/gps-test.html; novo public/css/pages/gps-test.css. Testes em tests/delivery-browser.test.js e gps-test-browser.test.js.

## Verificações e publicação

-43 testes aprovados, zero falhas: delivery-browser, gps-test-browser, navigation-engine e navigation-ui. Incluem projeção relativa à câmera: coordenada/centro avançam mantendo seta no mesmo pixel; arrasto interrompe acompanhamento; só heading não inventa deslocamento; idade e limpeza de leituras. Não são provas do aparelho físico.
- Links estáticos aprovados em41páginas; git diff --check sem erros.
- Deploy Railway **b6a13e0a-f368-461f-b9ec-7007c3431908 — SUCCESS**. Página diagnóstica, gps-test.js, map.js e gps-test.css remotos retornaram200, SHA-256 iguais aos arquivos locais. Health200 e banco conectado.
- Local health200, sessão37392 da rodada anterior. Não iniciar duplicata sem conferir porta.
- Base Git atual4999a5a; alterações locais ainda sem commit/push. Não limpar modificações do usuário. Pagamentos desativados, sem dados comerciais alterados ou e-mails enviados.

## Próxima resposta humana

Solicitado atualizar completamente `https://nacao-animal-production.up.railway.app/admin/testar-gps`, iniciar novo teste e caminhar20–30m; informar apenas se **Deslocamento estimado** aumenta ou continua~0m. Usuário respondeu **“Vou testar depois”**; resultado ainda pendente, não insistir até retomar. Não pedir coordenadas/ruas nem copiar localização pessoal de imagens.

Se aumentar, confirmar que o sensor acompanha o movimento; verificar mapa se deslocando ou usar rota completa para observar a seta. Se ficar~0m, conferir idade/precisão e distinguir leituras congeladas de variação abaixo do erroGPS antes de mudar aquisição. Não prometer que esta alteração resolveu o sensor.

Entrega entre cliente/admin continua sem validação: última consulta remota zero pedidos e pagamentos desativados. Diagnóstico não compartilha posições nem testa permissões comerciais; recálculo continua manual60s. Preservar essas limitações e regras dos registros17/16.
