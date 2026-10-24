# Continuidade — resposta rápida do GPS — 24/10/2026

Este registro prevalece sobre os registros anteriores para a apresentação da seta, o recálculo e as alternativas de rota.

## Pedido e correções de escopo

O usuário confirmou, após caminhar com o próprio celular, que a seta melhorou bastante e deixou de ficar parada. Quer que acompanhe o deslocamento com resposta rápida, usando a mesma apresentação do simulador. Não pediu opções de locomoção: a expressão sobre caminhada/transporte se referia ao ritmo do movimento. A seleção de transporte adicionada por interpretação errada foi retirada antes da publicação. O usuário também rejeitou o modal de alternativas mostrado na conferência; modal e botão de abertura foram removidos. Não voltar a introduzi-los.

O pedido anterior de alternativas e recálculo ao desviar continua: Google Maps permanece como provedor. O perfil interno original de cálculo é DRIVE, sem seletor ou inferência de transporte. A seta usa as coordenadas recebidas e responde também à caminhada; isso não transforma o perfil de roteamento em rota pedestre. Não prometer todas as rotas possíveis nem desempenho idêntico ao aplicativo nativo.

## Implementação

- `map.js`: duração visual máxima de 320 para **160 ms**, menor em velocidade alta. Marcador, precisão e câmera compartilham a posição visual; outro fix substitui a animação em andamento. Nenhuma extrapolação, multiplicação de velocidade ou fila de movimentos. O motor e a publicação usam o GPS bruto imediatamente. Mesmas funções em simulador, diagnóstico e entregador.
- Preservados limites de suavização de 5 s entre leituras, idade até 3 s e precisão até 50 m. Velocidade ausente/zero não impede o movimento observado; pausas, perda de sinal, ocultação e saltos grandes interrompem a animação. Uma amostra antiga não volta a orientar.
- Serviço de rotas solicita alternativas e geometria de alta qualidade. Até quatro trajetos retornados são normalizados, com resumo, tempo, distância e identificadores. Avisos do provedor preservados. Geometria inválida continua recusada pelo motor; eventos ancorados de acesso a pé com geometria colapsada são agregados somente a etapas conectadas, sem inventar segmentos.
- Alternativas cinza aparecem somente no mapa da navegação; acompanhamento do cliente/admin conserva a rota selecionada. Caminhos e limites são recalculados somente quando a lista muda, não em cada fix.
- Lista discreta de alternativas dentro das informações existentes da rota, fechadas por padrão. Componente inline `route-options.js` e CSS próprio, sem dialog, controle de foco, listeners globais ou opções de locomoção.
- Diagnóstico `/admin/testar-gps`: desvio provoca recálculo automático, com uma espera cancelável e intervalo mínimo de 16 s. Usa o fix mais recente quando a espera termina, sem parar/reiniciar GPS. Falha de provedor bloqueia repetição automática até tentativa manual. Trocar uma alternativa usa a lista já recebida, sem nova consulta ao Google.
- Entregador: cancelamento de consulta/resposta antiga por geração, época e AbortController; fila de recálculo cancelada em erro, parada e ocultação. GPS local continua antes de publicar ou aguardar rede. Backend preserva limite de 15 s e valida GPS recente/preciso.
- Novo PATCH `/api/public/entregas/rota` recebe somente identificador e versão da lista; bloqueia a entrega ativa, seleciona opção já armazenada e invalida consulta antiga sem mudar GPS ou chamar Google. Lista obsoleta responde409; link encerrado410. Falha concorrente ao salvar rota não encerra link que continua ativo.
- Navegação mostra atualização de trajeto ao desviar; velocidade pode continuar disponível com GPS recente fora da rota, mas não com sinal vencido/impreciso. Relatório agregado sem localização da rodada22 preservado.
- Cinco HTML usam versão de recursos `20261024-7`, preservando localhost e Railway.

## Verificações e limites

Após a retirada final do modal: **612 testes totais, 608 aprovados, zero falhas e quatro integrações ignoradas**. Integração PostgreSQL executada separadamente nesta rodada em esquema temporário local, com seleção de rota e serviços simulados, aprovada. Links estáticos aprovados em42HTML e diff sem erros. Conferência adicional confirmou ausência de dialog, botão de abertura e seletor de locomoção nos dois HTML. Nenhuma venda, pagamento, e-mail ou posição real foi criado pelo agente.

Regressão de caminhada com cadência de 3/5 s e velocidade nula/zero: primeiro quadro após16ms já move a seta; metade do passo recebido aparece em até80ms e o fix é alcançado em até160ms. Câmera e marcador permanecem alinhados e não há avanço entre amostras. Todos os oito cenários artificiais continuam cobertos com motor/interface de produção. Esses resultados medem a apresentação, não a frequência do receptor físico.

Local estava saudável em `http://localhost:4600/`, banco conectado, sessão npm run dev37392. Verificar antes de iniciar outra instância. Preferência Chrome mantida; conector Chrome indisponível. Conferência estática da interface feita em aba interna oculta, depois fechada, sem iniciar GPS ou entrar em conta. Captura do modal retirada pelo usuário ficou somente na pasta de visualizações externa ao Git; não usar como prova da interface final.

## Publicação

Revisão7 publicada na demonstração autorizada: **`ff52a657-8821-4ef3-8d2d-63a4778e2e22` — SUCCESS**. Conferidos18arquivos HTTP200 e conteúdo igual ao local normalizando CRLF/LF: cincoHTML, noveJS e quatroCSS. Isso inclui o HTML final sem modal/seletor e o limite160ms de `map.js`. Health remoto e localhost200, ambos com banco conectado. A revisão6 anterior era `c8ef9350-737c-4955-976f-df49774ad7bd`. O ajuste final ainda não foi retestado fisicamente pelo usuário; não alegar aprovação em caminhada desta publicação.

Não alterar `.env`, variáveis, chaves, pagamentos ou dados comerciais. Não houve commit/push; preservar alterações e commits do usuário. Railway é demonstração, futura produção Vixpi com instalação limpa conforme registros anteriores.

Próximo teste físico autorizado: atualizar https://nacao-animal-production.up.railway.app/admin/testar-gps no Chrome do celular e iniciar novo teste com a página visível. Não pedir coordenadas ou repetir longos percursos para descobrir erros de lógica. Compartilhamento comercial entre aparelhos continua pendente por falta de pedido autorizado; última consulta tinha zero pedidos e pagamentos desativados. Não forçar status ou pagamento para fabricar teste.
