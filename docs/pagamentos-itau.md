# Pagamentos com recebimento no Itaú

A Nação Animal pretende aceitar Pix e cartão de crédito, com recebimento na conta PJ do Itaú. A solução bancária e os serviços a contratar ainda precisam ser confirmados com o responsável pela conta. A integração de pagamentos herdada do PetFlow usa PagBank; os adaptadores para Rede e Itaú ainda não foram implementados.

Os campos abaixo são reservas de configuração para preencher depois dessa definição. Preenchê-los não habilita cobranças. Mantenha os pagamentos desativados durante a preparação:

```dotenv
PAYMENTS_ENABLED=false
PAYMENT_PROVIDER=pending
PAYMENT_ENVIRONMENT=sandbox

REDE_CLIENT_ID=
REDE_CLIENT_SECRET=

ITAU_PIX_CLIENT_ID=
ITAU_PIX_CLIENT_SECRET=
ITAU_PIX_RECEIVER_KEY=
ITAU_PIX_CERT_PATH=
ITAU_PIX_PRIVATE_KEY_PATH=
```

O nome de cada variável pertence ao contrato desta aplicação; a correspondência com as credenciais e os requisitos do serviço contratado deve ser confirmada na documentação oficial. Nenhum endpoint bancário está definido por esses campos.

## O que preencher depois

| Variável | Uso previsto |
| --- | --- |
| `PAYMENTS_ENABLED` | Permanece `false` até a integração estar implementada e validada. |
| `PAYMENT_PROVIDER` | Permanece `pending` enquanto o provedor estiver indefinido. |
| `PAYMENT_ENVIRONMENT` | Ambiente de testes, inicialmente `sandbox`. |
| `REDE_CLIENT_ID` | PV do estabelecimento, correspondente ao `clientID` da autenticação OAuth da Rede. |
| `REDE_CLIENT_SECRET` | Chave de integração, correspondente ao `clientSecret` da Rede. |
| `ITAU_PIX_CLIENT_ID` | Identificação da aplicação para Pix direto no Itaú, somente se esse serviço for contratado. |
| `ITAU_PIX_CLIENT_SECRET` | Segredo da aplicação Pix correspondente, somente para essa integração direta. |
| `ITAU_PIX_RECEIVER_KEY` | Chave Pix da conta recebedora aprovada para a integração direta contratada. |
| `ITAU_PIX_CERT_PATH` | Caminho privado do arquivo de certificado exigido pela integração Pix direta, conforme a documentação. |
| `ITAU_PIX_PRIVATE_KEY_PATH` | Caminho privado do arquivo da chave privada correspondente, quando exigido. |

O [tutorial oficial de autenticação da e.Rede](https://developer.userede.com.br/files/erede/tutorial-oauth2.0.pdf) apresenta a correspondência entre PV/chave de integração e `clientID`/`clientSecret`, além do uso de um `access_token` temporário. Confirme a documentação do serviço contratado antes de implementar.

Ter conta PJ e CNPJ não comprova que esses serviços já estejam habilitados. O Pix pode fazer parte da solução de checkout escolhida ou exigir uma integração direta separada; a decisão depende da contratação. Os campos `ITAU_PIX_*` só serão usados nessa segunda hipótese.

Mesmo com `PAYMENTS_ENABLED=true`, selecionar um provedor sem adaptador implementado mantém a cobrança bloqueada. A liberação exige código de integração e validação; não ocorre apenas pela presença das credenciais.

## Credenciais e arquivos

Preencha as credenciais de integração somente no `.env` local privado ou nas variáveis protegidas do serviço de hospedagem. Não coloque valores reais no `.env.example`, nos arquivos públicos ou no Git.

Não salve um `access_token` temporário no `.env`: o futuro adaptador deverá obter e renovar esses tokens conforme a documentação do serviço. Não solicite senha bancária ou arquivos de chave privada por WhatsApp. A senha de acesso à conta bancária não é uma credencial desta aplicação.

O [guia oficial do Itaú sobre credenciais e certificados](https://devportal.itau.com.br/guia-de-criacao-de-credencial-e-certificado) descreve a criação de credenciais por ambiente e a emissão do certificado da aplicação. Os campos de certificado e chave privada recebem apenas caminhos. Os arquivos devem ficar fora de `public/` e fora do Git, acessíveis somente ao processo do servidor e às pessoas autorizadas. No Railway, o modo de disponibilizar esses arquivos será definido durante a integração.

## Etapas para liberar os pagamentos

1. Confirmar com o gerente/Itaú ou a Rede quais serviços atenderão Pix e cartão, a conta de recebimento, as taxas, os prazos e as regras de parcelamento. Definir se o Pix usará o checkout contratado ou a API direta do Itaú.
2. Obter a documentação oficial dos serviços contratados, os requisitos de autenticação e notificações, os ambientes e os procedimentos de homologação. O [portal de desenvolvedores da Rede](https://developer.userede.com.br/ponto-partida) e o [portal do Itaú](https://devportal.itau.com.br/guia-de-criacao-de-credencial-e-certificado) são referências iniciais. O banco pode solicitar testes acompanhados pelo responsável técnico.
3. Obter credenciais de teste e, se aplicável, certificados de teste. Preencher apenas os campos correspondentes à solução definida, mantendo `PAYMENTS_ENABLED=false` durante a preparação.
4. Implementar o adaptador, a criação da cobrança e a confirmação do pagamento. Validar autenticidade dos webhooks, evitar processamento duplicado e conferir a atualização do pedido, estoque e financeiro, inclusive em falhas, cancelamentos e estornos.
5. Executar os testes do serviço e concluir a homologação exigida pelo provedor. Conferir Pix, cartão e parcelamento com o responsável pela conta.
6. Obter as credenciais de produção, configurar o ambiente definitivo e liberar os pagamentos somente com o provedor implementado e a validação concluída. Confirmar o recebimento na conta PJ do Itaú.
