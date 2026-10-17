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
