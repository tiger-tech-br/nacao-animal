# Continuidade — fluidez da navegação — 24/10/2026

Este registro prevalece sobre o 20 para a apresentação do GPS e os percursos simulados.

## Pedido e escopo

O usuário observou que a seta já anda, mas parecia lenta/travada. Após uma análise somente leitura, autorizou melhorar a fluidez, direção e câmera e testar velocidades diferentes. Manter Google Maps e o projeto web. Perguntou sobre Navigation SDK Android; explicado que ele requer aplicativo móvel separado. O usuário considera o app outro escopo/cobrança. Não criar app nem integrar SDK Android neste pedido. Waze continua somente última alternativa.

**Preferência nova: usar Google Chrome**, não Edge, para abrir o site e fazer verificações. Não mudar o navegador padrão do Windows. Tentativa de abrir Chrome pelo conector não estava disponível; a janela nativa existente foi localizada, mas o controle foi interrompido por não conseguir identificar com confiança a URL atual. Não contornar o bloqueio com outro método de automação. Nenhum controle adicional do computador nesta rodada depois desse bloqueio. O navegador integrado foi usado anteriormente para testes de navegação.

## Alterações

- `map.js`: animação visual por requestAnimationFrame, compartilhada entre seta, círculo e câmera; interpolação somente entre coordenadas já recebidas. Limite programado de 320 ms; em alta velocidade a duração encurta, usando velocidade nativa/deslocamento observado. Sem extrapolar GPS, sem fila de panTo. Nova leitura substitui a animação a partir do ponto já exibido.
- Direção pelo menor arco, inclusive 359→1 e 1→359. Não cria deslocamento quando só muda rumo. Primeira leitura, retomada, intervalo longo, salto, velocidade zero e GPS antigo/impreciso aparecem diretamente; preferência de movimento reduzido desliga animação.
- GPS bruto permanece intacto para motor, manobras, chegada e envio ao servidor; animação não passa posições intermediárias para esses fluxos. Intervalo de compartilhamento de 2 s não limita o mapa local.
- `pauseMotion()` cancela quadros em erro GPS, leitura vencida, ocultação, pausa/stop e recusa Maps. Epoch protege callbacks antigos. Uma resposta de rota com a mesma amostra não reinicia animação nem retoma após pausa. Próxima leitura válida retoma diretamente.
- Seguir/recentralizar/redimensionar usa ponto visual atual. Arrastar e escolher rota completa continuam respeitados. Limites da geometria são calculados somente quando a rota muda; enquadramento completo inclui GPS atual.
- Simulador agora tem 7 cenários: os 4 anteriores + condução até 30, 50 e 80 km/h, curvas com redução, parada de 3 s e retomada. Novos cenários usam `intervalMs` desde o ponto anterior; scheduler usa intervalo do próximo ponto, com clamp100–5000/default1000, separado do recálculo600ms. Pausa/reset/ocultação cancelam sequência.
- Métricas somente no simulador mostram tempo de animação/desenho, idade da leitura ao receber e diferença visual até a leitura mais recente, sem expor coordenadas. Layout estável em grade para evitar deslocamento do mapa quando os textos mudam.
- Scripts/estilos dos 5 HTML de entrega/diagnóstico/simulador/acompanhamento usam versão `20261024-5`.

## Verificação

- Suíte geral: **556 testes,552 aprovados,0falhas,4integrações de banco ignoradas**. Após pequeno ajuste nos textos das métricas, os12 testes do controlador foram repetidos e passaram. Não alegar que as integrações de banco foram executadas nesta rodada; nenhuma alteração no backend/SQL foi necessária.
- 42 HTML passaram na verificação de links. Diff sem erros, somente avisos normais LF/CRLF.
- Testes com RAF/relógio controlado cobrem quadros intermediários, sincronismo câmera/seta, limite/duração por velocidade, troca de alvo sem fila, menor arco, mesma amostra com nova rota, cancelamento, movimento reduzido e preservação do GPS bruto.
- Controlador + motor + interface de produção completaram os7cenários, com intervalos variáveis e proteções de autorização/callbacks antigos. Somente posições artificiais; sem localização real, publicação GPS, pedidos, pagamentos ou persistência.
- No navegador integrado com **Google Maps real**, os percursos de **80 e50km/h** concluíram com chegada. Em30 leituras do DOM durante animação, a diferença entre centro da seta e centro do mapa ficou em até0,6pixel; diferença visual diminuiu até0m. Isso demonstra sincronismo visual no ambiente exercitado, não latência do receptor GPS físico.
- Não concluir que30km/h foi percorrido no navegador: a tentativa final foi interrompida por reinicialização do controle e a preferência do usuário mudou para Chrome. O cenário30 passou nos testes automatizados com os componentes reais.
- Local `/api/health` retornou200/banco conectado; servidor existente preservado.

## Publicação

Upload CLI da árvore atual concluído na demonstração autorizada: deploy `2591a87e-a90e-494d-a882-b13a51bce453` **SUCCESS**. Os 12 arquivos publicados foram conferidos por HTTP200 e conteúdo idêntico ao local, normalizando CRLF/LF: 5 HTML, 6 JS e CSS do simulador. Saúde remota HTTP200, status ok e banco conectado. O anterior `c7ff51ca-b193-4f15-9775-9073019912b3` também era SUCCESS.

Conector Railway repetiu autorização sem concluir duas vezes; a CLI existente confirmou projeto/serviço/domínio e pagamentos desativados antes do upload. Não houve mudança de variáveis, `.env`, permissões Google, banco ou credenciais. Sem commit/push automático. Preservar os commits e alterações do usuário.

URL: https://nacao-animal-production.up.railway.app/admin/simular-navegacao . Local: http://localhost:4600/admin/simular-navegacao . Diagnóstico físico: `/admin/testar-gps`.

## Limites e próxima validação

Não prometer equivalência ao app Google Maps nem certificar condução real pelos testes. A suavização tem duração curta, mas frequência/precisão do GPS ainda dependem do aparelho/navegador. Primeiro concluir publicação e revisão interna. Depois combinar teste físico curto e autorizado; não iniciar captura da localização do usuário nem insistir em caminhada para depurar código. Acompanhamento de pedido entre aparelhos ainda exige uma entrega autorizada; não fabricar pagamento/status.
