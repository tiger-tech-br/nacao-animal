# Preparação para publicação — Nação Animal

Conferência de 19/10/2026. O cliente ainda não definiu o visual nem informou a
solução bancária, o e-mail e o domínio. A loja permanece em preparação local.

## Situação confirmada

- PostgreSQL local `nacao-animal`: 38 migrações registradas.
- Administrador ativo; a validação local de 17/10 cobriu login, produtos,
  estoque, painel e upload real de uma imagem temporária. Veja
  [o registro da validação](validacao-local.md).
- `JWT_SECRET` local exclusivo já gerado; seu valor fica somente no `.env`.
- Nome, logotipo transparente e copyright aplicados ao site.
- Textos de e-mail, notificações e atendimento identificam a Nação Animal.
- Pagamentos desativados, com campos reservados para a futura integração.
- Revalidação em 19/10: 137 testes aprovados com PostgreSQL local, sem falhas
  ou testes ignorados; links estáticos conferidos em 31 páginas HTML.

`npm run release:check` aprovou 26 de 35 verificações nesta conferência.
As nove pendências correspondem ao modo de desenvolvimento, URL local, três
verificações de pagamento, três de catálogo/estoque e e-mail público da loja.
O comando confere configuração e estrutura; credenciais preenchidas não
comprovam que os serviços pertençam ao cliente nem que estejam homologados.
Não altere o ambiente local para produção apenas para eliminar essas pendências.

## Próximos passos e responsáveis

| Frente | O cliente define ou fornece | Trabalho técnico após a definição |
| --- | --- | --- |
| Visual | Paleta e aprovação do layout | Implementar e conferir computador e celular. |
| Catálogo | Produtos, categorias, fotos, preços, quantidades e fornecedores | Cadastrar dados reais e conferir estoque e catálogo. |
| Pagamentos | Produto contratado, meios habilitados, conta de recebimento, taxas, parcelas e acessos autorizados | Implementar a API escolhida, notificações, consultas, cancelamentos e estornos; testar e liberar produção. |
| E-mail | Endereço oficial e acesso ao domínio | Configurar remetente verificado no Resend e testar confirmação de cadastro e recuperação de senha. |
| Domínio e hospedagem | Domínio e conta responsável pela hospedagem | Criar aplicação e PostgreSQL próprios no Railway, configurar DNS, HTTPS e variáveis privadas. |
| Frete e GPS | Confirmar endereço de origem, política de frete e conta responsável pelo Google Maps | Habilitar/restringir as APIs para o novo endereço público e conferir uma entrega real em celular. |
| Atendimento e textos | Confirmar contatos e regras comerciais | Atualizar termos e privacidade com o provedor definitivo e os dados da loja. |

O [guia de cadastro Itaú/Rede](cadastro-itau-rede.md) detalha o que o responsável
pelo pet shop faz e quais informações permitem iniciar a integração.

## Conferência final antes de vender

1. Publicar a aplicação com banco próprio, migrações aplicadas e administrador
   definitivo. Gerar um segredo JWT exclusivo para produção.
2. Validar dados da loja, catálogo real, preços, fotos e estoque disponível.
3. Testar cadastro, confirmação de e-mail, login e recuperação de senha.
4. Conferir frete, rota e GPS em um celular com permissão de localização.
5. Testar cobrança, confirmação, expiração, recusa, duplicidade de notificações,
   cancelamento e estorno conforme o produto bancário contratado.
6. Com o proprietário, realizar uma compra controlada e confirmar o recebimento
   na conta acordada. Definir responsáveis pelo atendimento e pelas integrações.
7. Executar `npm run release:check` no ambiente publicado e revisar as evidências
   dos testes reais. Liberar pagamentos somente com adaptador implementado e
   validação concluída.

Até a definição do cliente, os dados reais de produção e as credenciais não
devem ser inventados ou substituídos por dados de outra loja. A preparação
existente permite continuar o desenvolvimento quando essas informações chegarem.
