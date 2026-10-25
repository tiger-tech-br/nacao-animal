# Entregas: Google Maps e status do pedido

Atualizado em 25/10/2026 por decisão do usuário após o teste físico da navegação própria. A operação adotada é **Google Maps para navegar e status do pedido no site**.

## Operação atual

1. A loja marca o pedido como **Saiu para entrega** no painel de pedidos.
2. Em **Rota da entrega**, usa **Gerar link para o entregador**. O link privado vale 12 horas; gerar outro invalida o anterior. Compartilhe apenas com quem fará a entrega.
3. O entregador abre o link no celular. O site consulta a entrega autorizada e mostra o endereço salvo no pedido, incluindo o complemento para conferência.
4. **Navegar no Google Maps** abre um link HTTPS oficial do Google Maps, com o destino e o perfil de carro. O aplicativo ou o navegador será usado conforme o aparelho. A localização de origem, a escolha do percurso, as instruções e a navegação ficam a cargo do Google Maps. Confira o destino antes de sair.
5. O cliente usa **Acompanhar pedido** em Meus pedidos ou no e-mail. Precisa entrar na conta usada na compra. A tela mostra o status registrado pela loja e o endereço do pedido; consulta novamente a cada 15 segundos enquanto visível. Também possui **Atualizar status**.
6. Ao entregar, a loja marca **Entregue** no painel. Abrir o Maps ou chegar ao destino não altera o pedido automaticamente. Pedidos entregues, finalizados ou cancelados encerram as consultas automáticas desta tela.

## Localização e privacidade

- A tela do entregador não solicita GPS, não envia localização, não calcula rotas internas e não carrega as APIs de mapa/navegação próprias.
- O acompanhamento do cliente e do administrador mostra status, sem mapa ao vivo, trajeto ou previsão de chegada calculada a partir do GPS.
- O endereço enviado ao Google Maps é o endereço da entrega salvo no pedido. O complemento fica visível na página para conferência; não faz parte da busca de rota. A credencial privada, o ID do pedido e a sessão não entram na URL externa. O link usa `noopener noreferrer` e `referrerpolicy="no-referrer"`.
- A página revalida a entrega ao voltar do Maps ou pelo histórico. Links inválidos/expirados e entregas encerradas não oferecem navegação. Falha de conexão ou endereço incompleto bloqueiam o botão e permitem nova consulta.
- Maps URLs dispensa chave de API para abrir o aplicativo: https://developers.google.com/maps/documentation/urls/get-started . Isso não muda a configuração ou o custo do cálculo de frete já existente no projeto.

## Compatibilidade

As rotas HTTP, tokens privados, prazo de 12 horas, autenticação do cliente e do administrador e mudanças de status existentes foram preservados. Nenhuma migração de banco ou configuração de pagamento é necessária.

Os componentes de GPS/navegação, APIs antigas, simulador e diagnóstico administrativo permanecem no repositório para compatibilidade e histórico. Não são carregados nas telas de entrega ou de acompanhamento atuais e não fazem parte do fluxo recomendado. Testes antigos exclusivamente sobre a navegação do entregador foram substituídos por testes de abertura externa, status, autorização, rede e ciclo de vida; os testes dos componentes legados continuam separados.

## Conferência no celular

Com um pedido autorizado em **Saiu para entrega**, gerar o link, abrir no celular e tocar em **Navegar no Google Maps**. Conferir que o aplicativo recebe o endereço correto e inicia a navegação após a ação necessária no aparelho. No site, conferir a mudança de status feita pelo painel. A validação automatizada da URL não substitui esse teste físico. Não criar pedidos, cobrar pagamentos ou publicar o projeto apenas para executar essa conferência sem autorização.
