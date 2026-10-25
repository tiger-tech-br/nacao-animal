# Entregas: Google Maps, localização compartilhada e status

Atualizado em 25/10/2026 por decisão do usuário após o teste físico da navegação própria. A operação adotada é **Google Maps para navegar e status do pedido no site**. O usuário também aprovou que o entregador ative o compartilhamento de localização no próprio Maps, copie o link e o cole na página da entrega. O site avisa a loja e o cliente e oferece acesso ao acompanhamento externo.

## Operação atual

1. A loja marca o pedido como **Saiu para entrega** no painel de pedidos.
2. Em **Rota da entrega**, usa **Gerar link para o entregador**. O link privado vale 12 horas; gerar outro invalida o anterior. Compartilhe apenas com quem fará a entrega.
3. O entregador abre o link no celular. O site consulta a entrega autorizada e mostra o endereço salvo no pedido, incluindo o complemento para conferência.
4. **Navegar no Google Maps** abre um link HTTPS oficial do Google Maps, com o destino e o perfil de carro. O aplicativo ou o navegador será usado conforme o aparelho. A localização de origem, a escolha do percurso, as instruções e a navegação ficam a cargo do Google Maps. Confira o destino antes de sair.
5. Para disponibilizar o acompanhamento ao vivo, o entregador ativa **Compartilhamento de localização** no aplicativo Google Maps, copia o link e volta à página da entrega para colá-lo. Deve copiar o link de localização, não apenas o link de uma rota ou de um lugar. O site não consegue ativar o compartilhamento nem pressionar o botão Iniciar dentro do Google Maps.
6. Ao compartilhar pelo site, a loja e o cliente recebem uma notificação. O cliente também recebe tentativa de envio de e-mail, conforme a configuração e a disponibilidade do provedor. O e-mail aponta para a página autenticada do pedido; não contém o endereço privado de compartilhamento do Maps.
7. O cliente usa **Acompanhar pedido** em Meus pedidos, no sino ou no e-mail. Precisa entrar na conta usada na compra. A tela mostra o status registrado pela loja e o endereço do pedido; consulta novamente a cada 15 segundos enquanto visível. Também possui **Atualizar status**. Se houver link disponível, o botão **Acompanhar localização no Google Maps** abre o aplicativo ou a página externa. O administrador encontra o mesmo acesso em **Acompanhar entrega** no painel.
8. Ao entregar, a loja marca **Entregue** no painel. O site deixa de oferecer o link da localização. O entregador também deve **parar o compartilhamento no próprio Google Maps**, pois o site não consegue revogar a autorização do aplicativo. Abrir o Maps ou chegar ao destino não altera o status do pedido automaticamente. Pedidos entregues, finalizados ou cancelados encerram as consultas automáticas desta tela.

## Localização e privacidade

- A tela do entregador não solicita GPS, não envia coordenadas, não calcula rotas internas e não carrega as APIs de mapa/navegação próprias. Recebe somente o link informado pelo entregador.
- O acompanhamento do cliente e do administrador mostra status e um acesso ao Google Maps quando há link fornecido pelo entregador. O mapa ao vivo é exibido **pelo Google Maps**, sem mapa interno, trajeto ou previsão de chegada calculados pelo site.
- O link é oferecido somente para o pedido em **Saiu para entrega**, por até 24 horas a partir do compartilhamento no site. Ocultar ou expirar o acesso no site não encerra o compartilhamento no Google Maps. Quem já recebeu ou copiou o endereço externo pode continuar com acesso até o entregador encerrá-lo no aplicativo ou o prazo definido no Google terminar.
- O site valida o formato e o domínio permitido do link; não confirma automaticamente que o Google está enviando posições, que o link ainda está ativo ou que o entregador chegou ao destino. Essa informação deve ser conferida no próprio Google Maps.
- O endereço enviado ao Google Maps é o endereço da entrega salvo no pedido. O complemento fica visível na página para conferência; não faz parte da busca de rota. A credencial privada, o ID do pedido e a sessão não entram na URL externa. O link usa `noopener noreferrer` e `referrerpolicy="no-referrer"`.
- A página revalida a entrega ao voltar do Maps ou pelo histórico. Links inválidos/expirados e entregas encerradas não oferecem navegação. Falha de conexão ou endereço incompleto bloqueiam o botão e permitem nova consulta.
- Maps URLs dispensa chave de API para abrir o aplicativo: https://developers.google.com/maps/documentation/urls/get-started . Isso não muda a configuração ou o custo do cálculo de frete já existente no projeto.

## Compatibilidade

As rotas HTTP, tokens privados, prazo de 12 horas do link do entregador, autenticação do cliente e do administrador e mudanças de status existentes foram preservados. O compartilhamento externo acrescenta persistência e sua migração deve ser aplicada pelo processo normal de publicação. Não exige mudança na configuração de pagamentos.

As antigas páginas de teste de GPS e simulação, seus arquivos exclusivos e a API de diagnóstico foram retirados. Componentes legados de mapa/navegação e as APIs antigas de entrega permanecem para compatibilidade; não são carregados nas telas atuais. Os testes dos componentes legados continuam separados, com percursos artificiais internos à pasta de testes. A operação da loja usa somente o fluxo de pedidos e o Google Maps.

## Conferência no celular

Com um pedido autorizado em **Saiu para entrega**, gerar o link, abrir no celular e tocar em **Navegar no Google Maps**. Conferir que o aplicativo recebe o endereço correto e inicia a navegação após a ação necessária no aparelho. Ativar o compartilhamento no aplicativo, copiar o link e disponibilizá-lo pela página da entrega. Conferir a notificação no sino e o acesso autenticado do cliente e do administrador; o e-mail depende do provedor. Ao concluir ou ocultar o link no site, conferir que o botão deixa de aparecer e encerrar separadamente o compartilhamento no Google Maps. A validação automatizada da URL não substitui esse teste físico. Não criar pedidos, cobrar pagamentos ou publicar o projeto apenas para executar essa conferência sem autorização.
