# Google Maps: frete e mapa

Estado final conferido em 21/10/2026: CEP e cotação real anônima funcionaram. Após corrigir a chave e reiniciar, Google retornou cotações HTTP200: 16m/R$0 e 1.586m/R$3, com token presente. Depois de separar as chaves e reiniciar novamente, cotação de 1.586m/R$3 permaneceu HTTP200. Não houve pedido ou cobrança de teste. A configuração pública do mapa foi conferida, mas sua renderização visual ainda não foi validada.

Erros anteriores foram resolvidos: primeiro houve Google403/PERMISSION_DENIED e, durante a edição do `.env`, Google400/API_KEY_INVALID. A correção final da chave resolveu a cotação. As chaves antes compartilhadas foram separadas pelo usuário e confirmadas diferentes em leitura privada. O endpoint /api/public/entregas/mapa-config fornece somente a chave do navegador, atualizada e com Cache-Control:no-store. Nunca copiar chaves para docs ou chat. As restrições efetivas no Google Cloud não foram inspecionadas.

## Projeto do Nação Animal

O usuário esclareceu que ainda não criou um projeto específico do Nação Animal no Google Cloud. As chaves atuais já existiam, mas o projeto proprietário delas não foi confirmado. É possível configurar o projeto existente, ou criar um projeto separado chamado Nação Animal para organizar APIs, credenciais e consumo. Não é necessário publicar o site no Railway para fazer testes locais.

Para um novo projeto: abrir o seletor de projetos no [Google Cloud](https://console.cloud.google.com/), escolher Novo projeto, criar e selecionar Nação Animal, vincular faturamento e ativar Routes API e Maps JavaScript API. Criar duas chaves separadas com as restrições descritas abaixo e salvá-las diretamente no `.env` local. Não alterar ou revogar as credenciais do PetFlow sem conferir seu uso.

## Chave do servidor — cálculo do frete

1. Abra [Credenciais](https://console.cloud.google.com/apis/credentials) e selecione o projeto que contém a chave usada em `GOOGLE_MAPS_API_KEY`.
2. Na biblioteca do mesmo projeto, abra [Routes API](https://console.cloud.google.com/apis/library/routes.googleapis.com) e confira se está ativada.
3. Confira se o projeto está vinculado a uma conta de faturamento ativa. Ativar uma API não substitui essa vinculação.
4. Abra a chave do servidor. Em **Restrições de API**, permita **Routes API**. Confira outros usos da chave antes de remover permissões existentes, especialmente se ela também atende o PetFlow.
5. Para a aplicação do servidor, use **Endereços IP**, incluindo o IP público de saída do computador/servidor que faz a chamada. `localhost` e `127.0.0.1` não são o IP público visto pelo Google. Se o IP da conexão mudar, atualize a restrição. Na hospedagem futura, use o IP de saída da hospedagem.
6. Salve e aguarde a propagação da configuração antes de testar novamente. Não é necessário trocar o código para liberar permissões no Google.

## Chave do navegador — mapa de acompanhamento

`GOOGLE_MAPS_BROWSER_API_KEY` é uma chave separada, usada pela Maps JavaScript API. Habilite essa API no projeto e restrinja a chave a ela e aos sites autorizados. Para desenvolvimento local, os sites são `http://localhost:4600/*` e, se utilizado, `http://127.0.0.1:4600/*`. Acrescente o domínio real quando publicar.

O servidor publica apenas a chave do navegador no endpoint de configuração do mapa. Nunca substituir essa variável pela chave privada de Routes.

## Teste no site

- Abra `/sacola` e informe um CEP com oito dígitos, mesmo sem entrar na conta. A rua, o bairro, a cidade e a UF devem aparecer. Complete número e eventuais campos ausentes.
- Calcule o frete. Só considerar liberado depois de uma resposta real HTTP 200 com distância, valor e token de cotação. Não simular uma distância para esconder o erro 403.
- A tarifa existente é até 1 km grátis e R$ 3 por quilômetro adicional ou fração. Cotação não cria pedido, envia e-mail ou cobra pagamento.
- CEP usa ViaCEP/BrasilAPI e não depende das chaves do Google. Se ambos falharem por rede bloqueada, conferir o ambiente em que o servidor foi iniciado.

## Proteção das chaves

As chaves enviadas no chat devem ser substituídas no Google Cloud. Salve as substitutas diretamente no `.env` local, sem colá-las em chats, documentos ou arquivos versionados. Reinicie apenas o servidor do projeto após alterar variáveis; confirme o funcionamento antes de revogar as antigas e verifique se outro projeto também as utiliza. O `.env` está ignorado pelo Git.

Fontes: [Configuração da Routes API](https://developers.google.com/maps/documentation/routes/get-api-key), [restrições e proteção de chaves](https://developers.google.com/maps/api-security-best-practices) e [erros da Routes API](https://developers.google.com/maps/documentation/routes/handle-errors).
