# Validação local — Nação Animal

Verificação realizada em 17/10/2026, no banco PostgreSQL local `nacao-animal`.

- 38 migrações aplicadas, com checksums conferidos.
- Administrador ativo criado; login real e acesso às APIs de empresa, produtos,
  estoque e painel responderam com sucesso.
- Login provisório: `admin@nacao-animal.local`. A senha gerada está somente em
  `ADMIN_PASSWORD`, no `.env` local, que não é versionado.
- `RUN_DB_TESTS=1 npm test`: 137 testes aprovados, sem falhas ou testes ignorados.
- Cadastro e edição de produto, ajustes de estoque, histórico, estoque baixo e
  reflexo no painel/catálogo foram exercitados em schemas temporários. Nenhum
  produto fictício permaneceu na loja e nenhum schema de teste ficou no banco.
- Cloudinary real: autenticação, upload de imagem temporária, entrega pela CDN
  e remoção concluídos. O teste não alterou o banco nem imagens existentes.

O site local usa `http://localhost:4600`; o painel fica em
`http://localhost:4600/admin/`. Para iniciar, execute `npm run dev`.
Não é necessário executar novamente `db:seed-admin` para entrar; esse comando
redefine a senha cadastrada a partir do valor atual do `.env`.

O GPS de entrega permanece disponível. Os testes cobrem link do entregador,
posição no banco, acompanhamento, navegação, permissões e encerramento, com
coordenadas e respostas do Google simuladas. A validação em celular real ainda
depende de HTTPS acessível, permissão de localização e chaves/APIs do Google
habilitadas para o domínio. Veja as instruções de GPS no README.

Os pagamentos permanecem desativados até a definição e implementação da
integração com o banco. E-mail, domínio, paleta e layout continuam pendentes
da definição do proprietário.

## Revalidação em 19/10/2026

Após corrigir os textos herdados, o contato público e a configuração de testes
no GitHub, `RUN_DB_TESTS=1 npm test` aprovou novamente os 137 testes, sem falhas
ou testes ignorados. Os links estáticos passaram nas 31 páginas HTML.
Nenhum e-mail ou pagamento real foi enviado nesta rodada. O próximo trabalho
está organizado em [pendências de publicação](pendencias-publicacao.md).

## Cartão fictício na sacola pública — 19/10/2026

A sacola em `/sacola?teste=1` oferece uma compra fictícia para preenchimento manual do cartão, sem login administrativo, cadastro de produto, pedido ou reserva de estoque. A sacola original fica preservada. O botão **Confirmar compra de teste** envia a operação somente quando acionado pelo usuário.

A validação inicial pela tela confirmou aprovação de R$ 20,00 fictícios, consulta da transação e estorno com estado `Done` no Sandbox da Rede. Depois da validação, a página foi recarregada com os campos vazios para o usuário executar seus próprios testes. Nenhum novo teste de pagamento será disparado automaticamente ao abrir a página.

As verificações locais do código passaram: 143 testes aprovados, 3 testes com PostgreSQL ignorados nesta rodada e links estáticos aprovados nas 31 páginas. O bloqueio de produção, a exigência de conexão/origem local e a rejeição de cartões diferentes do fictício foram cobertos. `PAYMENTS_ENABLED=false` e `PAYMENT_PROVIDER=pending` continuam em vigor; esta ferramenta não habilita o checkout real.
