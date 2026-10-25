**Nação Animal — guia simples do painel administrativo**

Material para explicar o sistema ao dono da loja. Conferido no código atual em 24/10/2026, base c2f64f7. Os exemplos abaixo são ilustrativos; nenhum cadastro, compra ou pedido foi criado para produzir este guia.

O painel é a parte reservada à equipe. A loja pública é onde o cliente vê os produtos e faz seus pedidos. O painel organiza os cadastros, as mercadorias e o andamento da operação.

Para esta loja, não é necessário cadastrar uma equipe de entregadores: o dono e o pai trabalham no negócio e as entregas usam um único carro.

**Uma explicação de abertura que você pode usar**

“O cliente compra pela loja. Aqui no painel você organiza os produtos, acompanha o estoque e cuida dos pedidos. Também guarda os contatos dos fornecedores, registra as mercadorias que chegaram e acompanha os valores da operação. A integração para receber pagamentos online ainda será concluída.”

**A diferença mais importante: Compras e Pedidos**

| Quando acontece | Página usada | Exemplo |
| --- | --- | --- |
| O pet shop compra mercadoria para revender | Compras | A loja recebe dez pacotes de ração da distribuidora. |
| Um cliente compra mercadoria do pet shop | Pedidos | O cliente compra dois desses pacotes pelo site. |

Uma operação completa pode ser explicada assim: cadastre a categoria, o fornecedor e o produto; registre a compra quando a mercadoria chegar; confira o estoque; depois acompanhe os pedidos dos clientes. O financeiro reúne os valores registrados por essas operações.

1. **Painel da Loja: a visão geral**

   É a primeira página após entrar. Mostra um resumo para o dono perceber o que precisa de atenção.

   O cartão Faturamento hoje apresenta os valores dos pedidos considerados confirmados e uma referência do mês. Pedidos recebidos mostra a quantidade do dia e uma indicação de valores a receber. Produtos cadastrados mostra a quantidade de produtos e de clientes. Reposição pendente aponta mercadorias com estoque baixo e mostra uma referência das compras do mês.

   A página também exibe pedidos recentes, alertas de estoque e atalhos para outras áreas. Atualizar consulta os dados novamente. Ver pedidos abre a lista de pedidos. Ver a loja abre o site que o cliente utiliza.

   Exemplo: “Quando abrir a loja, você olha aqui para saber se chegaram pedidos e quais produtos estão acabando.”

   Esses números são indicadores operacionais. Faturamento não é lucro e o painel não é um extrato bancário.

2. **Clientes: consultar quem se cadastrou na loja**

   Reúne os dados dos clientes que fazem o cadastro pela parte pública do site: nome, CPF, telefone ou WhatsApp, e-mail, endereço e situação do acesso.

   A página atual é de consulta, com pesquisa e exportação CSV. Não apresenta formulário para o dono cadastrar ou editar um cliente. Para demonstrar o cadastro, use a loja pública; o registro aparece depois nesta lista.

   Exemplo: “Se um cliente entrar em contato, você pode localizá-lo aqui e conferir os dados cadastrados.”

   Excluir acesso desativa o acesso daquele cliente, encerra suas sessões e preserva o histórico necessário dos pedidos. Essa ação pode ser bloqueada enquanto há pedido em andamento. Ela não significa apagar definitivamente todos os dados. A exclusão solicitada pelo próprio cliente tem outro fluxo na área da conta.

   Cadastro de cliente e usuário administrativo são coisas diferentes: o cliente compra; o usuário administrativo cuida da loja.

3. **Categorias: organizar os produtos em grupos**

   São as divisões usadas para organizar o catálogo, como Rações, Brinquedos, Higiene e Acessórios.

   O formulário tem nome e descrição. É possível cadastrar, pesquisar, editar e remover categorias. A remoção desativa a categoria e preserva seu registro histórico.

   Exemplo: “Em vez de deixar todos os produtos misturados, você coloca cada um no grupo correspondente.”

   O formulário desta página não troca a imagem dos cards de categorias. Também não trate a remoção de uma categoria como uma forma de retirar automaticamente todos os produtos ligados a ela: cada produto tem seu próprio cadastro e situação.

4. **Produtos: montar os anúncios da loja**

   Aqui ficam as informações da mercadoria anunciada: nome, descrição, foto, categoria, fornecedor, SKU, código de barras, preço e custo.

   Nome e descrição explicam o que é o produto. A foto ajuda o cliente a identificá-lo. Categoria organiza o catálogo. Fornecedor informa de quem a loja costuma comprar aquele item. SKU é o código interno da mercadoria, por exemplo RAC-CAO-01; ele não é a mesma coisa que o código de barras.

   Preço é quanto a loja cobra do cliente. Custo é a referência de quanto a loja paga pela mercadoria. Por exemplo: custo R$30 e preço de venda R$45. A diferença de R$15 por unidade ainda não é lucro líquido, pois existem outras despesas e taxas.

   Ao criar, a foto é obrigatória. A orientação do formulário aceita JPG, PNG ou WebP, até5MB. Ao editar, pode-se manter a foto existente ou enviar outra. Depois de salvar, o catálogo público consulta as informações atualizadas.

   O cadastro do produto não informa, por si só, quantas unidades a loja possui. Essa parte pertence ao Estoque. Remover um produto o desativa para o catálogo e preserva os registros históricos.

   Comprar um produto por um custo diferente não reajusta automaticamente o preço de venda ou o custo informado no cadastro. Esses valores precisam ser revistos pelo responsável quando necessário.

5. **Estoque: saber a quantidade disponível**

   Mostra o saldo de cada mercadoria. Também reúne estoque mínimo, máximo e localização interna.

   Mínimo é uma referência para perceber quando está na hora de repor. Máximo ajuda na organização. Localização é algo como Prateleira B ou Armário2; não é endereço de cliente nem localização de GPS. Os avisos não fazem uma compra automática no fornecedor.

   Há duas formas diferentes de movimentar estoque: registrar uma operação normal, como uma compra recebida, ou fazer um ajuste manual por contagem, perda, avaria ou correção.

   No ajuste manual, Quantidade significa o saldo final que deve ficar no sistema. Se o sistema mostra10 e uma unidade foi perdida, informe9 e justifique. Não informe -1 tentando representar a diferença. O motivo permite entender depois por que o saldo mudou.

   Quando a mercadoria vem de fornecedor, registre em Compras. A entrada será feita automaticamente. Somar as mesmas unidades outra vez em Estoque duplicaria o saldo.

   Exemplo: “O sistema mostra dez pacotes, mas a contagem encontrou nove. Aqui você corrige para nove e registra o motivo.”

6. **Fornecedores: guardar os contatos de quem abastece a loja**

   São as distribuidoras e empresas das quais o pet shop compra produtos para revender. Não são os clientes do site.

   O formulário pede nome ou razão social e CNPJ. Também permite telefone, e-mail e endereço. Esses cadastros aparecem ao escolher o fornecedor de um produto e ao registrar uma compra.

   Exemplo: “A Distribuidora Exemplo vende ração para o pet shop. Você cadastra o contato dela uma vez e depois identifica que as reposições vieram dessa empresa.”

   A página permite pesquisar, editar e remover fornecedores. Se já existem compras ligadas ao fornecedor, a remoção o desativa para preservar o histórico.

   Cadastrar um fornecedor não envia uma mensagem para ele, não faz pedido e não transfere dinheiro. A negociação e o pagamento continuam sendo feitos pela loja. O formulário atual também não oferece um campo específico para definir prazo de pagamento.

7. **Compras: registrar a mercadoria recebida do fornecedor**

   Esta página registra as reposições que o pet shop faz para ter produtos para vender.

   Escolha o fornecedor, informe a data e acrescente os produtos já cadastrados. Para cada item, informe quantidade e valor unitário daquela compra. O sistema calcula os subtotais e o total. Observações permitem registrar uma informação complementar.

   Exemplo: dez pacotes de ração por R$30 cada resultam em uma compra de R$300. Ao salvar, a compra já é registrada como recebida. O sistema registra os itens, soma dez unidades ao estoque e cria uma conta a pagar de R$300 no Financeiro.

   Registre como compra recebida quando estiver reconhecendo a chegada da mercadoria. O fluxo atual não tem uma etapa de enviar uma encomenda à distribuidora nem uma fase separada de confirmação de recebimento.

   Salvar a compra não paga o fornecedor. É um registro da operação e de seu compromisso financeiro. A conta gerada usa a data da compra como vencimento; o formulário não tem um campo próprio para escolher outro prazo.

   Uma compra recebida não é livremente editada ou apagada. Há a ação Cancelar, com motivo. Ela reverte a entrada de estoque e o lançamento relacionado. Se parte das unidades já foi usada ou vendida e o estoque ficou insuficiente para a reversão, o cancelamento pode ser recusado.

   Para explicar ao cliente: “Quando chegar mercadoria, você registra aqui. O estoque aumenta sozinho e o sistema guarda quanto aquela reposição custou.”

8. **Pedidos: acompanhar as compras feitas pelos clientes**

   Aqui aparecem as compras recebidas pela loja pública. É possível pesquisar por pedido ou cliente, filtrar situação e período, abrir os detalhes e exportar a lista.

   Os detalhes mostram o cliente, contato, endereço salvo na compra, produtos, quantidades, valores, desconto, frete, total e observações. São informações de consulta; o painel não oferece edição livre de preços ou dos itens de um pedido já recebido.

   As situações significam:

   | Situação | Como explicar |
   | --- | --- |
   | Aguardando pagamento | O pedido foi registrado e espera confirmação do pagamento. |
   | Pedido recebido | O pagamento foi aprovado e a loja pode cuidar do pedido. |
   | Preparando | A mercadoria está sendo separada. |
   | Saiu para entrega | O dono saiu com o pedido e pode usar o compartilhamento de GPS. |
   | Entregue | A loja confirmou que o cliente recebeu. |
   | Finalizado | O atendimento daquele pedido foi encerrado. |
   | Cancelado | O pedido foi cancelado pelo fluxo permitido. |

   A integração de pagamentos ainda está pendente. Portanto, não apresente a aprovação real ou o estorno como já operacionais. O sistema não permite simplesmente escolher Pagamento aprovado no painel para fingir a confirmação do provedor.

   Antes da confirmação, o pedido não deve avançar para entrega. Depois da aprovação, pode ir para preparação e saída. Após sair, pode ser marcado como entregue; depois, finalizado. Cancelamentos têm regras e pedem motivo. Cancelar um pedido já pago depende também do tratamento com o provedor de pagamentos.

   O estoque reserva unidades durante o processo de compra e confirma a reserva quando o pagamento é confirmado, evitando descontar duas vezes. Expiração ou cancelamento podem liberar as unidades conforme o caso.

   O site tem avisos por sino e e-mails. Há mensagens específicas de pagamento aprovado, saída, entrega e cancelamento; não existe um e-mail diferente para toda situação. O envio também depende do serviço de e-mail configurado.

9. **GPS da entrega e teste sem pedidos**

   No pedido em Saiu para entrega, o dono pode gerar o link da viagem diretamente. Não há cadastro de entregador. O transporte das entregas é o carro da loja.

   O link é privado e vale12horas. Gerar outro invalida o anterior. O dono abre no celular, toca em iniciar e permite a localização. O cliente acompanha a própria entrega pela conta; o administrador também pode acompanhar.

   A seta acompanha a posição recebida do aparelho e o sistema recalcula o trajeto quando confirma um desvio, respeitando o intervalo entre consultas. O transporte define as vias da rota, não a velocidade da seta. É necessário manter o celular com localização, internet e a página visível; o navegador pode suspender a localização em segundo plano.

   Chegar ao destino não marca o pedido como Entregue automaticamente. A loja precisa confirmar isso. Fechar a página também não conclui o pedido.

   Para a demonstração sem compra ou pedido, use https://nacao-animal-production.up.railway.app/admin/testar-gps . Esse teste usa a localização real e calcula um trajeto até a loja. Não é um pedido comercial, não compartilha a posição com um cliente e não grava as coordenadas do teste no banco.

   O simulador de navegação usa posições artificiais e serve para conferir o comportamento do mapa. Ele é diferente do teste físico feito com o celular.

10. **Financeiro: acompanhar valores e compromissos**

   Há duas coisas diferentes: o controle financeiro interno e a integração que recebe o pagamento do cliente. A integração de recebimento online ainda será concluída.

   O controle interno reúne descrição, tipo, origem, valor, valor pago, vencimento, data do pagamento, situação e observações.

   Conta a pagar é dinheiro que a loja precisa desembolsar, como fornecedor, aluguel ou energia. Conta a receber é valor a receber. Manual é o lançamento criado diretamente no painel. Outros lançamentos vêm de operações como compras e pedidos.

   Exemplo manual: registrar uma despesa de energia de R$100. Se foram pagos R$40, pode-se registrar o pagamento parcial mantendo o compromisso pendente. Restam R$60. Para marcar o lançamento manual como pago, informe o valor integral e a data.

   Registrar um pagamento manual não transfere dinheiro nem movimenta a conta bancária. Apenas informa ao sistema que ele ocorreu fora dali.

   Os indicadores mostram a receber, a pagar, vencidos e pagos. Pagos não é lucro líquido nem saldo em banco; inclui registros de diferentes tipos.

   Lançamentos manuais podem ser criados, editados e excluídos. Os originados por compra ou pedido são protegidos e não podem ser alterados livremente nessa tela. Seu cancelamento deve acompanhar a operação de origem.

   Há uma pendência financeira específica: a conta automática gerada por uma compra ainda não tem uma ação de baixa disponível no painel. Não prometa que o dono pode abrir essa conta e marcá-la como paga ali hoje. Essa baixa é diferente da integração de pagamento do cliente e deve ser concluída no trabalho financeiro.

11. **Cupons: oferecer desconto na compra**

   Permite criar e administrar códigos que o cliente informa na compra.

   Código é o texto usado pelo cliente, como NACAO10. Tipo define desconto percentual ou em reais. Compra mínima exige um subtotal de produtos. Desconto máximo limita o abatimento. Início e validade controlam o período. Limites de uso restringem a campanha inteira ou o uso por cliente.

   Ativo permite usar o código. Mostrar entre os cupons disponíveis permite divulgá-lo na própria loja. Um código pode estar ativo sem estar nessa lista pública.

   Exemplo: NACAO10 com10%, compra mínima de R$50, teto de R$15 e um uso por cliente. Uma compra de R$60 em produtos ganha R$6 de desconto. Uma compra de R$200 fica limitada a R$15 de desconto. O frete é tratado separadamente.

   O sistema confere validade, mínimo e limites no servidor. Desativar impede usos novos e conserva o histórico. Tornar o cupom público não envia e-mail ou WhatsApp automaticamente.

12. **Usuários: controlar quem entra no painel**

   São os acessos da equipe, separados das contas dos clientes. O formulário tem nome, e-mail, senha, perfil e situação do acesso.

   O dono e o pai podem ter acessos próprios caso queiram identificar quem realizou cada alteração. Isso não cria cadastro de entregador e não é uma etapa para usar o GPS.

   Ao editar um usuário, deixar a senha em branco preserva a atual. Alterar senha, perfil ou situação pode invalidar a sessão anterior. Desativar impede acesso; reativar permite novamente. O sistema protege a própria conta contra desativação ou rebaixamento e exige que reste um administrador ativo.

   Administrador tem os acessos administrativos. Gerente tem acesso a parte da operação, como painel, pedidos, atendimento e GPS, mas não a todos os módulos. O servidor verifica essas permissões; ver um item no menu não significa ter autorização para usá-lo.

13. **Auditoria: consultar quem fez uma alteração**

   É o histórico das ações importantes, com data, usuário, ação, módulo e descrição. Pode guardar também informações anteriores e novas quando a operação as fornece.

   Exemplo: “O preço mudou? Você consulta aqui quem fez a alteração e quando.”

   A página é de consulta e pesquisa, com exportação dos registros carregados. Não é uma tela para cadastrar ou apagar auditorias e não substitui um backup completo. Pode conter dados pessoais das operações; não é uma lista para compartilhar com qualquer pessoa.

14. **Atendimento: responder solicitações dos clientes**

   Organiza solicitações relacionadas aos pedidos, como reclamações, cancelamento, arrependimento e devolução. Mostra protocolo, cliente, tipo, situação e prazo.

   O fluxo normal é localizar uma solicitação recebida, abrir a edição, ler o motivo, colocar em análise, responder e concluir como atendida ou negada. A resposta final precisa de texto e pode gerar notificação e e-mail ao cliente.

   Não é um WhatsApp integrado nem um chat ao vivo. Uma devolução respondida não devolve, por si só, a mercadoria ao estoque.

   Atenção: atender uma solicitação de cancelamento ou arrependimento pode executar também o cancelamento do pedido, se ele ainda estiver numa etapa em que isso é permitido. Não use Atendida apenas para dizer que leu a mensagem. Cancelamento de pedido pago também depende do fluxo financeiro.

15. **LGPD: organizar solicitações sobre dados pessoais**

   É a área para acompanhar pedidos relacionados a acesso, correção, exportação, exclusão ou outras informações sobre os dados do cliente.

   Mostra protocolo, cliente, assunto, situação, data e prazo. Permite analisar, responder e registrar a conclusão da solicitação.

   Exemplo: “O cliente quer saber quais informações a loja guarda sobre ele. Você acompanha o pedido aqui e registra a resposta.”

   Marcar como Atendida registra a conclusão; não apaga nem anonimiza automaticamente todos os dados. A própria conta do cliente tem outro fluxo de exportação e exclusão. Havendo pedido ativo, uma exclusão pode precisar de análise em vez de ser imediata.

   Ter essa página ajuda a organizar solicitações, mas não transforma todo o atendimento de privacidade em uma ação automática.

16. **Configurações: manter os dados da própria loja**

   Reúne nome, razão social, CNPJ, telefone, e-mail, endereço completo, horário de abertura e fechamento e logo.

   Exemplo: “Mudou o telefone de atendimento ou o horário informado ao público? Você altera os dados aqui.”

   Esses dados são usados na página pública de Contato. Os horários são informativos; não fecham automaticamente a compra fora do expediente. A logo enviada deve ser compatível com os formatos aceitos; a troca não significa substituir todas as imagens fixas do layout.

   O endereço da empresa é o destino do teste de GPS. A origem usada para calcular o frete está configurada separadamente no servidor: mudar o endereço aqui não muda essa origem automaticamente. Se a loja mudar fisicamente, essa parte também precisa ser conferida na configuração técnica.

17. **Sino e botões comuns**

   O sino administrativo do painel inicial mostra avisos, como novos pedidos, novos clientes e solicitações. O número representa avisos não lidos. No painel, use Marcar exibidas como lidas. A leitura é individual: o dono ler não significa que o aviso ficou lido no acesso do pai.

   Na área do cliente, o comportamento é diferente: os avisos apresentados podem ser marcados automaticamente como lidos. O sino não substitui os avisos por e-mail.

   Pesquisar filtra os registros carregados. Atualizar consulta os dados de novo. Exportar CSV baixa uma planilha da listagem filtrada/carregada; não é cópia completa do banco. Editar carrega um registro no formulário. Salvar grava a alteração. Limpar ou cancelar edição não apaga automaticamente um registro. Sair encerra a sessão. Ver a loja abre a parte pública em outra aba.

**Roteiro sugerido para a conversa com o cliente**

Comece pelo Painel da Loja. Depois explique Categorias e Produtos, mostrando a diferença entre preço e quantidade. Em seguida, apresente Fornecedores e faça o exemplo verbal de uma compra de dez pacotes. Mostre onde aparece o saldo em Estoque. Passe para Pedidos e explique o caminho até a entrega. Use o teste de GPS independente para a demonstração física. Por fim, mostre Cupons, Clientes e as páginas de controle e atendimento.

Para conversar sobre dinheiro, diga que o painel já reúne registros, mas que a integração de recebimento online e os ajustes financeiros pendentes serão concluídos antes de anunciar compras reais como operacionais.

**Cuidados específicos para você, antes de demonstrar**

- Atendimento e LGPD têm consulta, edição e resposta implementadas. Os controles genéricos de criar/excluir que podem aparecer nessas páginas não têm as rotas correspondentes; use o fluxo de solicitações recebidas e resposta na apresentação.
- Não marque uma solicitação como atendida sem saber seu efeito. Atendimento pode cancelar um pedido; LGPD não executa exclusão só por mudar o status.
- Não prometa baixa direta da conta automática do fornecedor no Financeiro; é uma pendência financeira separada do gateway.
- Não prometa aprovação manual de pagamento, pagamento de fornecedor, emissão de nota fiscal, integração contábil, envio automático de encomenda ao distribuidor ou cálculo de lucro líquido.
- O teste de GPS pode ser apresentado sem pedido. O compartilhamento de uma entrega comercial exige o pedido autorizado no fluxo correto.

Este guia descreve o sistema; não alterou páginas, dados, pagamentos, credenciais ou hospedagem.
