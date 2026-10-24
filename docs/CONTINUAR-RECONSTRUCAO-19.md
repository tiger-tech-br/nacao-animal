# Revisão do GPS completo — 24/10/2026

Este registro prevalece sobre18/17/16 para falhas, testes e publicação do GPS.

## Evidência do aparelho e escopo

Usuário confirmou o reteste: **“Os metros aumentam, mas o mapa fica parado”**. Isso confirma que novas coordenadas chegam à página; a investigação deixou de tratar a situação apenas como percepção de seta centralizada. Depois autorizou investigar o GPS inteiro. Não solicitar novamente os mesmos dados já informados nem alegar correção física sem novo percurso.

Revisados captura/retomada do entregador e diagnóstico, câmera/marcador, motor de manobras, cálculo de rota, publicação de posições, acompanhamento cliente/admin, autenticação/loja/cliente, expiração/revogação e condições de corrida. Revisão de funcionamento, sem alteração de pagamentos, credenciais ou configuraçãoGoogle.

## Falhas corrigidas

1. **Câmera:** acompanhamento começa na primeira posição do modo entregador, independente do motor já ter rota válida. Cada coordenada define o centro diretamente com `setCenter`, antes de redesenhar a seta; não depende da fila de animações `panTo`. Ver rota completa/arrastar são escolhas manuais preservadas; o botão Seguir reativa explicitamente. Ocultar restaura o modo inicial.
2. **Posições atrasadas/duplicadas no servidor:** atualização atômica só aceita horário estritamente mais novo. Leituras anteriores ou com mesmo timestamp recebemACK200 sem substituir posição, precisão ou horário; link revogado continua410. Cliente legado sem timestamp mantém compatibilidade.
3. **Origem da rota:** servidor exige coordenadas válidas, captura até15s/futuro até5s e precisão<=50m antes de cache ou Google. Antes aceitava posição de até2min e precisão muito baixa.
4. **GPS suspenso e respostas de rede:** rota pendente não restaura manobras após perda de sinal/aba oculta. Erro do sensor limpa posição ainda enfileirada para publicação. Diagnóstico também ignora posições fora de ordem.
5. **Ciclo de vida:** wake lock atrasado é liberado; exceção síncrona do watch permite nova tentativa. Pausa/encerramento mantêm isolamento por geração.
6. **Progresso/manobras:** motor ignora leituras repetidas ou fora de ordem. Previsão de chegada usa horário da leitura real, sem avançar apenas por renderizar o relógio.
7. **Acompanhamento cliente/admin:** consultas pendentes são canceladas/descartadas ao mudar sessão, ocultar ou sair. Coordenadas/precisão/timestamp são validados, leitura anterior não faz marcador voltar, GPS antigo não aparece como ao vivo. Encerrar/erro fecha mapa ampliado e restaura rolagem.

Principais arquivos: controllers/entregaController.js; public/js/pages/delivery/{map,driver,gps-test,navigation,navigation-engine,tracking}.js. Templates entregador, diagnóstico e rastreamentos usam versão20261024-3. Indicadores locais do registro18 permanecem; não foram acrescentadas posições artificiais ao funcionamento do site.

## Verificação realizada

- Suíte geral: **481 testes,477 aprovados,0falhas,4 integrações ignoradas**. Corrigida uma verificação estática que comparava caminhos de scripts sem considerar parâmetros de versão; mantém contrato de presença e ordem dos scripts.
- Executado separadamente o fluxo completo com **PostgreSQL local em schema temporário isolado**, aprovado. Google, pagamentos e e-mails simulados só nesse teste. Inclui SQL real de monotonia, duplicata divergente preservada e rota recusada com GPS antigo/impreciso. Schema limpo pelo teste; dados reais e Railway não alterados.
- Links estáticos aprovados em41páginas e git diff --check sem erros.
- **Google Maps real no navegador:** conferência controlada com3coordenadas artificiais, sem solicitar GPS do computador e sem pedido. Câmera e marcador avançaram; centro retornado pela API e área do marcador conferidos na tela. Isso valida renderização/controlador do mapa, não substitui o percurso físico.
- A página e o script temporários dessa conferência foram restaurados/removidos ANTES da publicação. Página `/admin/testar-gps` voltou ao diagnóstico autenticado, sem fixture pública. Captura da conferência contém só dados artificiais e fica fora do repositório.
- Local health200/banco connected. Confirmar porta4600 antes de iniciar instância; última sessão registrada37392.

## Publicação confirmada

O próprio fluxo GitHub/Railway já publicou as alterações; não foi necessário outro upload CLI. Deploy **34e02872-5f93-4180-9f65-8763db81a4e5 — SUCCESS**, commit remoto **80d4dbba118062a8790e3fdfc3847feb47158f9b**, igual aoHEAD local durante verificação.

Seis JS remotos comparados por SHA-256 com locais: todos200/idênticos. HTML do diagnóstico, entregador e admin, e CSS diagnóstico também200/idênticos. HTML público de acompanhamento difere apenas por CRLF/LF: conteúdo normalizado idêntico e scripts versão3 presentes. Health remoto200, banco conectado. Teste estático de versão corrigido depois do commit, ainda sem commit/push nesta rodada; não modifica comportamento publicado.

Site: https://nacao-animal-production.up.railway.app/ . Teste físico: https://nacao-animal-production.up.railway.app/admin/testar-gps . A confirmação do movimento após ESTA correção ainda está pendente. Pedir atualizar completamente a página antes de retestar, sem solicitar ruas/coordenadas. Não prometer funcionamento idêntico a aplicativo nativo, GPS em segundo plano ou trânsito em tempo real.

## Limites e continuidade

Mapa/GPS/rota parados no celular já aprovados (registro17). Relato posterior confirmou posições em movimento, mas câmera parada; correção acima verificada em teste controlado. Ainda falta o novo percurso humano e uma entrega autorizada entre entregador, cliente e administrador. Última consulta remota continua zero pedidos e pagamentos desativados. Não forçar pagamento/status para fabricar evidência comercial.

Não houve novos clientes/pedidos reais, cobrança, e-mails, migrações, alterações do.env ou novas chaves. Preservar localhost, Railway como demonstração e futura produção limpa na Vixpi. Não reverter commits/arquivos do usuário.
