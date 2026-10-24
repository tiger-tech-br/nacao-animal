# Continuidade — entregadores e demonstração do GPS — 24/10/2026

Este registro prevalece sobre23 para o perfil de rota. O usuário mostrará o projeto ao cliente amanhã,25/10, e pediu GPS real disponível mesmo sem compras ou pedidos. Não ativar pagamentos ou fabricar vendas/status.

## Decisão aprovada

O usuário quer acompanhamento em qualquer deslocamento e atalhos compatíveis. Não quer opções de locomoção ou modal na tela GPS. Após explicar que o transporte não pode ser identificado com segurança só pela velocidade, escolheu **informar o meio de transporte no cadastro do entregador**. Registro operacional novo, sem login/senha para o entregador. A seta continua independente do transporte, usando a mesma animação de até160ms do simulador.

## Fluxo pronto

- Administração → **Entregadores**: nome, telefone opcional, carro/moto/bicicleta/a pé e situação. Lista permite editar, desativar e reativar; inativos não recebem novos links nem abrem teste. Desativação é reversível. Menu do dashboard e páginas administrativas atualizado.
- Ação **Testar GPS** do cadastro abre `/admin/testar-gps?entregador=UUID`. Antes de pedir localização, valida sessão ADMIN/GERENTE e cadastro ativo da mesma empresa. O servidor consulta o transporte; o navegador envia somente ID e os camposGPS, nunca perfil ou destino. O login preserva apenas o próximo endereço local validado por UUID.
- `/admin/testar-gps` sem ID funciona diretamente para **caminhada**. Não depende de pedidos, contas de cliente, pagamentos ou mudança de status. Destino sempre a loja cadastrada. Nenhuma coordenada deste teste é gravada no banco. O início exige toque e permissão no celular; não usar GPS do computador.
- Pedido autorizado em Saiu para entrega: selecionar o nome do entregador na seçãoGPS e gerar link. Só aceita entregador ativo da própria loja. O perfil é copiado para `entrega_rastreamento` na mesma transação, sob bloqueio. Cadastro editado durante a viagem não altera o perfil do link; novo link aplica a mudança e revoga o anterior. Links antigos existentes preservam carro.
- Corpo da criação de link agora exige `{entregadorId}`. Seleção do navegador não pode ditar geometria/perfil. Entregador continua usando link privado de12h, sem conta. GPS do cliente/admin não é solicitado.
- Perfis de servidor: CARRO→DRIVE, MOTO→TWO_WHEELER, BICICLETA→BICYCLE, A_PE→WALK. Opções de trânsito compatíveis com cada perfil; alternativas e alta qualidade preservadas. `calcularRota` legado continua DRIVE; `calcularRotaDiagnostico` usa WALK; `calcularRotaEntrega` valida os quatro valores antes do Google.
- Cobertura de caminhos do Google não garante todo atalho. Avisos de caminhada/bicicleta/moto ficam visíveis no resumo, sem popup; renderizados como texto, inclusive fora de rota, e limpos ao encerrar.
- Motor de caminhada agora usa desvio mínimo12m, ampliado conforme precisão; exige duas leituras distintas. Os demais perfis preservam50m. Corrigida chave do motor para incluir perfil mesmo quando a geometria é igual. Não houve previsão de posições ou mudança de velocidade artificial.
- Cadastro/pedidos respeitam empresa e ADMIN/GERENTE. Auditoria e gravação de entregador são atômicas. URL antiga é limpa ao trocar entregador/recarregar/falhar; respostas atrasadas após fechar ou trocar pedido não restauram link. Falha tardia de compartilhamento não copia link de outra pessoa.

## Banco e arquivos

Migração nova `118_entregadores.sql`: tabela entregadores e colunas entregador_id/meio_transporte do rastreamento. Nenhuma migração histórica editada. Aplicada no localhost com sucesso, sem criar cadastros ou pedidos. O predeploy existente do Railway aplicará a mesma migração na demonstração.

Novos arquivos de modelo/controlador/rotas de entregador; API `/api/entregadores`. Nova página `admin/pages/entregadores/entregadores.html`. Recursos de entrega e16páginas administrativas receberam versão `20261024-8` para evitar cache antigo. `.env`, credenciais e pagamentos preservados. Base Git atual do usuário **43c8e62**, não reverter; inclui trabalho intermediário salvo pelo próprio usuário. Sem commit/push do agente.

## Verificações

- Suíte completa: **675testes,671aprovados,0falhas,4ignorados**. Integração PostgreSQL executada separadamente:1/1aprovada, esquema temporário local removido. Provedores simulados; cobre os quatro perfis, cadastro porAPI, isolamento, desativação, vínculo, snapshot, novo link e revogação. Não executou fluxo comercial real.
- Links aprovados em43HTML; sintaxe/diff sem falhas. Nova regressão de login mantém ID válido e rejeita retorno externo/campos extras. ClienteGPS impede consulta/localização com cadastro inválido, ausente ou inativo e não acessa endpoints de pedidos no teste.
- **Quatro consultas reais ao Google**, com chave do Railway mantida só em memória e pontos públicos do centro de São Paulo: carro1rota, moto1, bicicleta2, caminhada3. Todas as alternativas criaram motor navegável. Nenhuma localização pessoal ou registro comercial utilizado; não repetir consultas sem necessidade.
- Conferência visual local autenticada em aba interna oculta: cadastro carregou vazio, formulário alinhado, largura de celular390px com conteúdo/viewport375px e sem overflow horizontal. Não salvou cadastro. Prévia do diagnóstico autenticada mostrou botão liberado sem pedido; não clicou em testar nem pediu GPS do computador. Aba fechada e viewport restaurado. Chrome indisponível no conector; não alegar automação visual no Chrome nem aprovação do receptor físico.
- Capturas somente na pasta de visualizações externa ao repositório: `entregadores-cadastro-desktop.png`, `entregadores-formulario.png`, `entregadores-cadastro-celular.png`. Sem dados reais de cliente ou localização.

## Publicação e próxima ação

Revisão8 publicada: **`0c799a6e-f028-479c-969a-d203290ecc0e` — SUCCESS**.23arquivos HTTP200 e conteúdo igual ao local: cincoHTML de entrega, trêsHTML administrativos, onzeJS e quatroCSS. Normalizados CRLF/LF e o BOM inicial do login; a única diferença inicial de comparação era esse BOM, confirmado por caractere65279local/60remoto e igualdade integral após removê-lo. Login remoto carrega recurso `20261024-8`.

Health Railway e localhost200, ambos com banco conectado. Login remoto da conta administrativa existente200, GETautenticado `/api/entregadores?ativos=true`200 com zero cadastros, comprovando migração118 disponível. POSTautenticado de diagnóstico sem posição retornou400 antes de consultar o Google, como esperado. Nenhum registro foi criado para essa conferência. Prévia local autenticada já mostrou o botão disponível sem pedido; não iniciar localização no computador. Revisão7 anterior: `ff52a657-8821-4ef3-8d2d-63a4778e2e22`.

Link direto para demonstrar caminhando: https://nacao-animal-production.up.railway.app/admin/testar-gps . Entrar como administrador no Chrome do celular, tocar em Testar GPS e permitir localização. Para outro transporte: https://nacao-animal-production.up.railway.app/admin/pages/entregadores/entregadores.html → cadastrar pessoa/transporte → Testar GPS. Manter página visível e tela ativa. Nova confirmação física desta revisão ainda pendente, sem obrigar um longo percurso para depurar código.

GPS comercial entre aparelhos continua pendente de pedido autorizado. Não criar pagamento fictício ou mudar status direto para demonstrar. Railway é demonstração; futura produção Vixpi seguirá instalação limpa e credenciais próprias conforme registros anteriores. Preservar localhost funcionando e o prompt atualizado.
