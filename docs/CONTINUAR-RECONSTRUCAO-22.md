# Continuidade — GPS real e vídeo — 24/10/2026

Este registro prevalece sobre21/20 para os critérios da animação e o diagnóstico físico.

## Relato e autorização

O usuário autorizou testar no celular com a localização real e o link do entregador. Consulta somente leitura no Railway confirmou **zero pedidos** e pagamentos desativados. O usuário escolheu explicitamente usar `/admin/testar-gps` por enquanto. Não foi criada sessão alternativa, cliente, venda, pagamento ou status fictício. Compartilhamento comercial continua sem validação porque exige pedido autorizado.

O usuário informou que o simulador funciona melhor que o GPS real e confirmou o sintoma **seta e mapa aos saltos ou com atraso**. Enviou uma gravação de tela e reforçou querer a mesma fluidez do simulador. Não atribuir o problema à descrição dele nem presumir que a gravação causou lentidão.

O vídeo de aproximadamente90s foi lido localmente, com quadros a intervalos. Mostra leituras recentes e precisão de3–4m nos quadros observados; a posição e a câmera mudam, portanto não demonstra perda prolongada de sinal. Também há estado fora da rota e, perto do final, mapa livre. Não copiar ruas, coordenadas, trajeto ou imagens pessoais para documentação/repositório/publicação. Material de análise ficou na pasta de visualizações externa ao Git. Não prova frequência exata do sensor ou desempenho sem a gravação.

## Correções concluídas

- `map.js` antes desligava suavização com intervalo maior que2,5s, idade acima de1,5s ou velocidade igual a zero. O simulador tinha leituras melhores que essas condições. Agora aceita interpolação curta entre leituras até5s e idade até3s; velocidade zero isolada não elimina deslocamento observado. Os limites lógicos de validade da navegação15s/50m foram preservados.
- Mantido máximo programado320ms, menor em velocidade alta, substituição da animação sem fila, sincronismo seta/círculo/câmera e nenhuma projeção além da posição recebida. Gaps acima de5s, idade acima de3s, saltos grandes e GPS impreciso continuam diretos, sem somar uma animação longa. Dados brutos do motor e compartilhamento permanecem intactos.
- Coordenada e direção idênticas não agendam animação inútil. Mensagem de carregamento aparece somente enquanto não existe mapa; status idêntico não refaz DOM/callbacks em toda leitura.
- `onMotion` ganhou phase sample/frame/paused, motivo da decisão, intervalo do sensor/recepção e métricas existentes; sem coordenadas.
- Novo `gps-quality.js` mede localmente intervalos, idade, faixas de precisão, disponibilidade de velocidade/direção e animações. Nenhum GPS, fetch, armazenamento ou telemetria adicional é usado pelo módulo. Relatório não inclui coordenadas, horário absoluto, endereço, rota, conta, token, ID ou informação do aparelho.
- Diagnóstico mostra intervalo entre leituras. Após **Parar teste**, oferece **Qualidade do último teste → Copiar diagnóstico sem localização**, com alternativa textarea se clipboard falhar. Só fica agregado local; finish elimina referências de horário e ignora eventos tardios. Novo teste/ocultação/recarregamento limpa o resumo. Callback atrasado de cópia não repõe mensagem após limpeza. A localização bruta segue sendo eliminada ao parar.
- Simulador agora tem **oito cenários**. Novo `gps-irregular`:88m/24frames, caminhada~1m/s, intervalos3/5s, precisão8/20m, rumo ausente, velocidade nula/zero e sampleAgeMs2000. Controlador respeita essa idade sem mudar timestamp de holds/perda de sinal. Não usa GPS real, API de rotas ou publicação em entregas.
- Cinco HTML de entrega/diagnóstico/simulador/acompanhamento usam versão `20261024-6`; diagnóstico carrega gps-quality antes de gps-test.

## Verificações

- **572 testes totais:568 aprovados,0falhas,4integrações de banco ignoradas**. Sem mudança de SQL/backend, sem repetir integração real de banco nesta rodada.
- Oito percursos do controlador + motor + interface de produção concluem. Regressões de mapa cobrem caminhada em8combinações de precisão/velocidade/intervalo, idade2s, fronteiras5s/3s e nenhuma extrapolação.
- Diagnóstico cobre privacidade do relatório, contagem sem inflar por RAF, stop/hide, callback de clipboard atrasado e reinício.42HTML aprovados em links; diff sem erros.
- Nenhum teste novo do receptor físico foi realizado pelo agente; vídeo é evidência do problema na versão anterior, não aprovação da correção. Preferência Chrome permanece. Não iniciar localização no computador. Não alegar teste visual automatizado desta revisão no Chrome.

## Publicação e continuidade

Revisão6 publicada na demonstração autorizada: deploy `c8ef9350-737c-4955-976f-df49774ad7bd` **SUCCESS**. Healthcheck do Railway aprovado;14arquivos conferidos HTTP200 e conteúdo igual ao local normalizando CRLF/LF (5HTML,7JS,2CSS). Health remoto200/statusok/banco conectado; local health200/banco conectado. `.env`, variáveis, credenciais, pagamentos e dados comerciais preservados; sem commit/push do agente.

Link do próximo teste: https://nacao-animal-production.up.railway.app/admin/testar-gps . Pedir atualizar a página e iniciar novo teste; relatório agregado serve para investigar eventual atraso restante sem pedir coordenadas ou descrição técnica detalhada.

O diagnóstico ainda calcula trajeto de veículo até a loja e o recálculo é manual (limite60s); o simulador e a entrega comercial têm seus respectivos recálculos. O vídeo mostrou estado fora da rota; não ocultar essa limitação, não confundir com sinalGPS parado e não alterar regras de pagamentos para criar entrega fictícia. Navegador não garante mesma frequência do app nativo nem GPS em segundo plano. Google Maps mantido; aplicativo/Navigation SDK é outro escopo, não solicitado.
