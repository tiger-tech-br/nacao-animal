# Cadastro e integração de pagamentos — Nação Animal

Guia consultado em **19/10/2026**, para o responsável pelo pet shop e o desenvolvedor. Objetivo: aceitar **Pix e cartão de crédito**, com recebimento na conta PJ do Itaú.

O produto bancário ainda depende da contratação do cliente. Este documento registra orientações públicas oficiais; não comprova aprovação comercial nem acesso a telas autenticadas. Nenhuma conta foi criada e nenhum contrato ou pagamento foi ativado para elaborar este guia.

## 1. Primeiro contato: confirmar o produto com o banco

O dono do pet shop pode explicar ao gerente:

> Estou desenvolvendo uma loja virtual própria para a Nação Animal. Quero receber Pix e cartão de crédito na conta PJ do Itaú. Preciso confirmar a solução para integrar o site, as taxas, os prazos de recebimento, o parcelamento e como liberar as credenciais para o meu desenvolvedor.

Peça uma confirmação por escrito do **nome do produto contratado** e de quais meios de pagamento estarão habilitados. A [Rede orienta solicitar o credenciamento e.Rede à central ou ao executivo comercial](https://www.userede.com.br/n/e-rede); depois fornece o PV e as instruções de integração. Ter CNPJ e conta Itaú não substitui essa contratação.

Escolha o roteiro conforme a resposta:

| Solução confirmada | Roteiro deste guia |
| --- | --- |
| e.Rede com crédito e Pix | Seção 4. Pode atender os dois meios, conforme habilitação contratada. |
| API de recebimentos Pix diretamente no Itaú | Seções 2 e 3. O cartão precisará da solução própria confirmada pelo banco. |
| Outro gateway ou produto | Solicitar a documentação correspondente antes de configurar o site. |

## 2. Cadastro no Itaú for Developers

Esta é a jornada do **Itaú**, diferente do portal de desenvolvedores da **Rede**.

1. Acesse o [Itaú for Developers](https://devportal.itau.com.br/) e escolha **cadastre-se**.
2. Em **informações pessoais**, preencha o nome completo do responsável, o e-mail de acesso e a área de atuação. O formulário permite informar **CNPJ**; para identificar a loja, use `14.506.937/0001-48` e a **razão social exata do cadastro da empresa**, que pode ser diferente do nome fantasia Nação Animal. Use um e-mail acessível pelo responsável; o domínio do site pode ser definido depois.
3. Conclua as etapas **senha → verificação → validar identidade**, seguindo as solicitações da tela. O próprio titular deve criar a senha e ler os termos antes de concluir. Se a empresa já estiver cadastrada, o administrador pode convidar o desenvolvedor para completar o próprio cadastro no contexto da empresa. [Formulário oficial de cadastro](https://devportal.itau.com.br/baas/#/create-account/personal-information).
4. Entre pelo botão **login**. Se o catálogo não aparecer, procure o comercial para verificar contrato e liberação; autocadastro sozinho não garante acesso ao catálogo.
5. Com o produto liberado, consulte a documentação da API de **recebimentos Pix** indicada pelo banco, seus ambientes e os testes disponíveis. Não confundir recebimento de clientes com uma API para enviar pagamentos Pix.

O [guia oficial de primeiro acesso](https://devportal.itau.com.br/conheca-o-portal) explica autocadastro, convite do administrador, catálogo, documentação e sandbox. As informações exatas exigidas no cadastro devem ser conferidas na tela atual.

## 3. Somente se for contratado Pix direto no Itaú

### Aplicação e permissões

1. Confirme com o banco que o CNPJ e o produto estão vinculados à organização.
2. Na nova experiência, um usuário **Administrador ou Owner** acessa **Aplicações → criar aplicação**.
3. Informa nome e descrição, seleciona os CNPJs e o produto contratado. Sugestão de nome: `Nação Animal — Loja Virtual`.
4. Se **criar aplicação** estiver bloqueado por falta de produto, solicite a vinculação ao officer ou pelo suporte. O perfil Developer consulta documentação e sandbox, mas não cria aplicações.

Fonte: [nova experiência — aplicações](https://devportal.itau.com.br/guia-de-criacao-de-aplicacao).

### Credenciais e certificado

5. O administrador autorizado abre a aplicação e entra em **Credenciais e certificados → criar credencial**, escolhendo o ambiente e o nome.
6. Guarda o **Client ID e o Client Secret** em local privado. O Secret aparece uma única vez.
7. Segue **Gerar certificado**, gera o token temporário solicitado nesse fluxo, completa a identificação e baixa o certificado. O desenvolvedor confere o material necessário à autenticação da API e guarda os arquivos fora da pasta pública e do Git.

Fonte: [nova experiência — credenciais e certificados](https://devportal.itau.com.br/guia-de-criacao-de-credencial-e-certificado).

8. Confirme a aprovação do **Owner no Bankline** quando exigida para certificado ou integrador. Se houver empresa integradora cadastrada, o responsável pode autorizar as aplicações para ela; não deve compartilhar seu login bancário. Consulte os [perfis e aprovações](https://devportal.itau.com.br/guia-de-criacao-de-aplicacao) e o [guia de autorização de integrador](https://devportal.itau.com.br/guia-de-autorizacao).
9. Se o banco orientar uma jornada diferente, siga a documentação vinculada ao contrato. O [guia de autenticação em produção](https://devportal.itau.com.br/autenticacao-documentacao) também descreve solicitação de credenciais de Pix ao OfficerCash/backoffice. Não misture etapas de jornadas diferentes sem confirmar com o suporte.
10. O desenvolvedor implementa a autenticação e os webhooks conforme a API liberada. Produção pode exigir **OAuth 2.0 e mTLS**, com certificado e chave privada; sandbox tem características distintas. O `access_token` é gerado e renovado pelo servidor. As URLs, os escopos e a autenticação das notificações devem vir da documentação do produto, não de exemplos genéricos. [Autenticação oficial Itaú](https://devportal.itau.com.br/autenticacao-documentacao).

O certificado dinâmico tem prazo de validade e precisa de renovação; registre o vencimento e o procedimento descrito no [guia de certificados](https://devportal.itau.com.br/guia-de-criacao-de-credencial-e-certificado).

## 4. Se for contratado e.Rede para cartão e Pix

### Cadastro e testes no Developers Rede

1. Acesse o [Portal do Desenvolvedor Rede](https://developer.userede.com.br/login), escolha **cadastre-se** e conclua o cadastro e as verificações solicitadas.
2. Entre em **Meus Projetos → Criar Projeto**, dê um nome e selecione o pacote **e.Rede**.
3. Guarde as credenciais de **sandbox** do projeto e baixe a **Postman Collection**. O desenvolvedor usa esse material para simular cobranças e respostas. O sandbox é gratuito e seu cadastro não exige vínculo contratual.

Fonte: [ponto de partida oficial Rede](https://developer.userede.com.br/ponto-partida). Essas credenciais são para testes; o projeto sandbox não credencia a loja para vender de verdade.

### Credenciamento e credenciais de produção

4. O responsável conclui o credenciamento comercial e confirma o **PV**, o crédito, o Pix e a conta de recebimento. A [página comercial e.Rede](https://www.userede.com.br/n/e-rede) descreve o contato comercial e o envio das orientações.
5. Acesse o [Portal UseRede](https://meu.userede.com.br/), que é separado do Developers Rede. Com o perfil autorizado, selecione o estabelecimento/PV correto e siga **Vender online → E-commerce → chave de integração**.
6. Se ainda não existir chave utilizável, siga a geração e salve-a em local privado. **Gerar uma nova chave invalida a anterior**; se já existir outra integração funcionando, coordene a troca com seu responsável.

O [tutorial oficial OAuth 2.0](https://developer.userede.com.br/files/erede/tutorial-oauth2.0.pdf) faz esta correspondência:

| Nome no portal Rede | Nome técnico |
| --- | --- |
| PV do estabelecimento | `clientID` |
| Chave de integração | `clientSecret` |
| Token dinâmico gerado pela API | `access_token` |

O desenvolvedor usa o PV e a chave no servidor para gerar e renovar o `access_token`. O cliente não precisa copiar um token temporário a cada venda. [Tutorial de autenticação](https://developer.userede.com.br/files/erede/tutorial-oauth2.0.pdf).

### Habilitar o Pix e suas notificações

7. No portal Rede, siga **Para vender → Pix → Habilitar Pix na Rede**, escolha a conta **Itaú Empresas** recebedora e conclua a criação/vinculação da chave conforme as telas. Confirme o Pix habilitado para o e.Rede contratado. A [página oficial de Pix](https://www.userede.com.br/n/pix) explica os requisitos e a escolha da conta.
8. Depois que o desenvolvedor definir a URL pública de notificação, solicite à central o cadastro do webhook Pix de produção, informando **CNPJ, PV, e-mail e URL**. Sem URL cadastrada não há notificações de pagamento. Consulte a seção de Pix do [manual oficial e.Rede, páginas 138–139](https://developer.userede.com.br/files/traducoes/erede/e-rede-24032026.pdf).

### Validação e produção

9. Publique a página de pagamento com HTTPS e cumpra os requisitos vigentes. O manual descreve verificação automática do certificado SSL após a primeira transação e revalidações periódicas. A opção de solicitar homologação é citada para regularização após suspensão. **Não existe neste guia uma promessa de homologação manual igual para todos os contratos.** [Manual e.Rede, páginas 25–26](https://developer.userede.com.br/files/traducoes/erede/e-rede-24032026.pdf).
10. Confirme com o atendimento qualquer habilitação ou teste adicional do contrato. A central oficial é **4001 4433** para capitais e regiões metropolitanas, ou **0800 728 4433** para outras localidades. [Contato oficial Rede](https://developer.userede.com.br/ponto-partida).

## 5. O que o cliente deve disponibilizar ao desenvolvedor

| Informação | Quando necessária |
| --- | --- |
| Nome do produto, documentação e contato/protocolo do banco | Sempre. |
| Confirmação dos meios habilitados, conta recebedora, taxas, parcelas e prazos | Sempre. |
| PV/clientID e chave/clientSecret, identificados por ambiente | Se for e.Rede. |
| Acesso próprio autorizado, credenciais e material de certificado conforme a API | Se for Pix direto Itaú. |
| Chave Pix aprovada para o serviço e confirmação do webhook | Conforme o produto contratado. |
| Domínio e e-mail oficial do pet shop | Para publicação e configuração definitiva. |

Use convite/permissões ou um canal privado combinado para os segredos. **Não é necessário entregar senha do internet banking, código de autenticação bancária ou login pessoal do dono.** Arquivos de chave privada devem ser gerados e guardados com acesso restrito pelo responsável técnico autorizado.

O `JWT_SECRET` do site protege a autenticação dos usuários da Nação Animal. É independente das credenciais bancárias e dos tokens de pagamento. Não substitua esse segredo por PV, chave de integração ou token do Itaú/Rede.

## 6. Trabalho técnico antes de liberar vendas

Esta é a lista de validação do projeto, além dos testes exigidos pelo provedor:

1. Implementar o adaptador do produto escolhido e os estados da cobrança/pedido.
2. Testar Pix pendente, pago, expirado e devolvido; cartão aprovado, recusado, cancelado e estornado, incluindo parcelamento contratado.
3. Verificar autenticidade das notificações, reenvios, duplicidade, consultas de confirmação e falhas de conexão. Conferir efeitos em estoque, pedidos e financeiro.
4. Concluir as habilitações e a homologação específicas do contrato. Credenciais de produção não são prova de que a integração foi testada.
5. Configurar credenciais e URLs de produção no servidor privado. Fazer uma transação controlada com o cliente, verificar o recebimento efetivo na conta combinada e o fluxo de estorno.
6. Liberar as vendas após a validação e acompanhar os primeiros pedidos. Registrar responsáveis por suporte e renovação de certificados, quando aplicável.

No projeto atual, as variáveis reservadas **não implementam a integração**. Mantenha os pagamentos desativados até concluir o código e os testes. Os detalhes da preparação estão em [pagamentos-itau.md](pagamentos-itau.md). Nenhuma credencial real deve entrar neste guia, no Git ou nos arquivos públicos.
