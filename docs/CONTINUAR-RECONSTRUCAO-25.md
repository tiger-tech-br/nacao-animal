# Continuidade — GPS e fluxo simples — 24/10/2026

Este registro prevalece sobre24. O usuário esclareceu que só trabalham o dono e o pai dele e que usam **um único carro**. Reforçou: queria resolver o GPS, sem inventar ou complicar o projeto. **Não criar módulos, cadastros, seletores, veículos ou outras funcionalidades sem novo pedido. Encerrar após retirar a exigência criada desnecessariamente.**

## Ajuste final

- A falha da seta parada foi corrigida nas revisões anteriores, com confirmação do usuário de que melhorou e passou a acompanhar. Preservar animação compartilhada de até160ms, posição real, câmera sincronizada, recálculo automático e testes do simulador. Não extrapolar GPS nem garantir frequência física do navegador.
- Entregas da loja usam CARRO. Gerar link direto no pedido autorizado, sem selecionar/cadastrar entregador. Corpo vazio; servidor define o transporte. Link continua privado12h e a geração de outro limpa GPS/rota e revoga o anterior.
- Retirados menu, página e controles do cadastro de entregadores do fluxo público administrativo. Não apagar registros ou migrações já aplicadas; estruturas legadas podem permanecer por compatibilidade, sem impor etapas ao usuário.
- `/admin/testar-gps` continua independente de compra, pedido e status. Exige sessão administrativa e toque para pedir localização. Calcula rota de carro até a loja, conforme operação real. A seta acompanha o deslocamento inclusive caminhando; o perfil de carro define caminhos permitidos, não a movimentação do marcador. Removida a consulta de cadastro do diagnóstico.
- Não há seletor de transporte ou modal na navegação. Sem novos campos de configuração ou variáveis; o veículo foi informado pelo usuário.

## Verificação e publicação

Verificação concluída: **660testes totais,656aprovados,0falhas,4ignorados**. Integração PostgreSQL isolada executada separadamente:1/1aprovada, provedores simulados, esquema temporário removido. Links42HTML aprovados, diff sem erros. Recursos de entrega e14páginas administrativas usam `20261024-9`. Nenhuma nova migração, variável ou alteração de dados comerciais. Não repetir consultas reais ao Google: quatro perfis já foram conferidos na rodada24 com pontos públicos e motor válido. Não capturar GPS deste computador nem criar pedidos/pagamentos para testar.

Revisão9 enviada: **`7064612c-c3c9-4a16-b925-ca72cf991df6`**, ainda **BUILDING** na última consulta. Os logs mostravam somente a inicialização do builder, sem erro de código. Não afirmar que a simplificação já entrou no ar. A revisão8 `0c799a6e-f028-479c-969a-d203290ecc0e` continua atendendo o site.

Última conferência de disponibilidade: `/admin/testar-gps` remoto HTTP200, botão de iniciar presente e teste sem compra/pedido; ainda carregava recursos anteriores, não versão9. Health remoto e localhost200, ambos com banco conectado. O objetivo imediato de manter GPS disponível para o cliente está preservado. O usuário pediu encerrar sem mais invenções; não prolongar alterações. Ao retomar, conferir apenas o resultado deste deploy e os arquivos publicados, sem criar outras funcionalidades ou repetir testes/consultasGoogle já aprovados.

O usuário mostrará o GPS ao cliente em25/10. Link de teste permanece https://nacao-animal-production.up.railway.app/admin/testar-gps . Localhost deve continuar em http://localhost:4600/ . Não alterar `.env`, senhas/chaves ou pagamentos. Base Git do usuário43c8e62; preservar seus commits e alterações. Sem commit/push do agente.

Após publicação, registrar resultado e encerrar. Não continuar construindo páginas ou novos fluxos. Confirmação física desta revisão fica para o usuário, sem insistência em novos percursos.
