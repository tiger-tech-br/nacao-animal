# Continuidade — percursos completos e simulador — 24/10/2026

Prevalece sobre19/18/17/16 para navegação, simulador, evidência humana e testes.

## Objetivo e direção do usuário

O usuário pediu navegação funcionando de verdade e validação pelo agente sem depender de caminhar/descrever falhas. Autorizou explicitamente **simular percursos**. Google Maps deve ser mantido; Waze é **apenas última alternativa**, não uma migração solicitada. Evitar culpar a descrição do usuário: o relato “metros aumentam, mapa parado” foi útil e suficiente para localizar o problema.

Após as correções, o usuário informou: **“parece que agora funcionou, agora a seta anda, era isso que eu queria”**. Isso confirma melhora observada por ele; não especificou se era simulador ou percurso físico. Não converter essa mensagem em prova de GPS físico completo/entrega comercial. Em seguida combinou fazer teste no celular com localização real **depois de terminar as verificações**. Não iniciar captura agora nem insistir em caminhar para depurar lógica.

## Simulador concluído

- URL `/admin/simular-navegacao`, HTML `views/delivery/simulation.html`, JS `simulation.js` e `simulation-scenarios.js`, CSS `delivery-simulation.css`.
- ADMIN/GERENTE conferido por GET `/api/auth/me` antes de permitir execução. Retorno do login aceita somente o caminho exato autorizado. Documento no-store, robots noindex e mesma CSP/referrer restrita das páginas Maps.
- Usa os componentes de **produção** `map.js`, `navigation-engine.js` e `navigation.js`. Pontos matemáticos artificiais na região pública40.78/-73.97, nunca localização de pessoa.
- Quatro percursos: **Curvas e chegada**28frames; **Desvio e recálculo**32frames; **Perda de sinal e retomada**37frames; **Passos curtos e retorno**37frames.
- Reprodução automática1frame/s; pausa, avanço manual, reinício; progresso, distância restante, recálculos e resultado explícito de chegada/falha. Página claramente marcada como simulação.
- Desvio solicita recálculo local a partir da posição artificial mais recente até o mesmo destino. Não consulta Routes API. Holds/ausência de sinal conservam coordenadas e timestamp; não criam novos fixes.
- Nenhum navigator.geolocation, pedido, pagamento, publicação deGPS ou gravação de dados. Rede da página apenas autenticação e carregamento do mapa Google pelo componente compartilhado.
- Reset/pausa/ocultação invalidam callbacks anteriores e cancelam reprodução/recálculo. Corrigidas corridas de autorização antiga e de “executar novamente” após concluir; retorno não reinicia percurso sozinho.
- Diagnóstico físico `/admin/testar-gps` contém link para o simulador. Scripts e login administrativo usam versão20261024-4.

## Falhas funcionais encontradas e corrigidas nesta rodada

1. Direção estimada perdia referência em cada leitura: passos pequenos nunca alcançavam o limiar para orientar a seta com heading=null. Agora acumula deslocamento observado a partir de uma referência, sem inventar movimento; ignora rumo inválido/impreciso e conserva direção quando parado.
2. Coordenadas inválidas podiam contaminar marcador/câmera. São recusadas antes de enviar ao Google.
3. Retorno planejado sobre o mesmo trecho ficava preso no progresso; seguir no sentido contrário ainda mostrava manobras. Motor diferencia a volta prevista e a direção contrária, com regressões para passos curtos e cruzamentos.
4. Destino perto da origem em outra parte da rota podia gerar chegada prematura. Chegada depende também do progresso coerente; não finaliza pedido automaticamente.
5. Etapa terminal sem geometria/deslocamento podia invalidar toda a navegação. Aceita apenas o caso terminal realmente zero; etapas positivas malformadas continuam recusadas. Rota total zero só reconhece chegada com origem/destino coincidentes e GPS recente próximo.
6. Voz/painel podiam repetir curva já executada, desenhar U-turn à direita como esquerda e exibir “Em0m”. Instrução, distância e ícone agora correspondem à manobra futura e ao momento correto.
7. Distância zero omitida pelo protocolo Google em resposta200 com rota válida virava erro. Normalização do serviço respeita default0; falhasHTTP, rota ausente e tipos inválidos continuam erro. Tarifa e regras comerciais existentes preservadas.
8. Cliente/admin exibiam Km/min originais até novo cálculo da rota. `tracking.js` usa o mesmo motor para restante/ETA pelo GPS, reinicia cache por rota/sessão e retira previsão confiável em desvio, sinal antigo ou impreciso. Templates carregam motor antes de tracking. Fallback sem geometria conserva estimativa estática, sem inventar avanço.

As correções de câmera direta, GPS monotônico, perda de sinal e respostas antigas do registro19 permanecem.

## Validação concluída

- **539 testes na suíte geral:535 aprovados,0falhas,4 integrações ignoradas.**
- Fluxo PostgreSQL local em schema isolado executado separadamente e aprovado após mudanças nos serviços. Google/pagamentos/e-mails substituídos por provedores de teste; nenhum dado comercial real alterado.
-42páginas HTML passaram na verificação de links; diff sem erros.
-14cenários funcionais usam motor/interface reais, coletor de fala e DOM de teste: curvas, ida/volta, sentido contrário, cruzamentos, chegada, precisão, sinal, voz, ETA e rotas zero.
- Contratos JSON Google→serviço→motor testam curvas, desvio, recálculo durante movimento, destino congelado, zero e erros de provedor.
- Controlador do simulador + navigation reais percorrem os4cenários; cobertura de acesso, cancelamento, ausência de GPS/persistência e callbacks obsoletos.
- **Os quatro percursos também foram executados automaticamente no navegador com Google Maps real**, autenticados no admin local. Todos chegaram; desvio concluiu com1recálculo. Nenhum GPS do computador foi solicitado. Captura `simulador-navegacao.png` na pasta de visualizações externa ao repositório.
- Local continua HTTP200/banco conectado. Última sessão registrada37392; conferir porta4600 antes de iniciar duplicata.

## Publicação

Base Git local observada **6d3b376**; usuário está fazendo commits durante o trabalho. Não reverter nem sobrescrever commits/mudanças dele. Upload CLI da árvore atual concluído: deploy **c7ff51ca-b193-4f15-9775-9073019912b3 — SUCCESS**. Treze arquivos remotos conferidos200 e conteúdo idêntico normalizando CRLF/LF:5HTML de GPS/entrega/simulador,6JS de navegação/simulador,login.js e CSS do simulador. Documento do simulador no-store/CSP/referrer corretos; health200/banco conectado; pagamentos desativados confirmados sem expor variables. Nenhum commit/push automático pelo agente.

Destino publicado e aberto: https://nacao-animal-production.up.railway.app/admin/simular-navegacao . Railway continua apenas demonstração; futura produção Vixpi limpa. Pagamentos permanecem desativados/sandbox. Sem novos pedidos/clientes reais, chaves, migrações ou alterações do.env.

## Próxima etapa e limites

Deploy verificado; manter simulador aberto para o usuário. A lógica dos trajetos passa nos cenários exercitados; simulador não certifica receptorGPS, permissões de cada aparelho, áudio físico, GPS em segundo plano ou trânsito em tempo real. O usuário autorizou teste com sua localização real somente depois das verificações; não capturar agora. Após fechar essa etapa, combinar validação física curta e objetiva, sem pedir descrição técnica.

Acompanhamento comercial entre aparelhos segue pendente de entrega autorizada; última consulta remota tinha zero pedidos. Não fabricar pagamento/status para simular venda real.

Consulta oficial sobre Waze feita apenas para avaliar a alternativa: deep links abrem o aplicativo; Navigation Connect tem requisitos próprios de aplicativo/validação e não é substituição direta do mapa web. Fontes: https://developers.google.com/waze/deeplinks/ e https://developers.google.com/maps/documentation/navigation/connect/overview . Nenhuma integraçãoWaze foi criada.
