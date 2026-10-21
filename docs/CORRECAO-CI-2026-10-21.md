# Correção da verificação no GitHub — 21/10/2026

O usuário relatou erro no deploy e pediu verificar no GitHub. Repositório: `tiger-tech-br/nacao-animal`, branch `master`, commit consultado `ef35cfdc17ec4af26d1f0ab1cd19a14fd13212d6`.

## Diagnóstico comprovado

A execução [Verificação da Nação Animal](https://github.com/tiger-tech-br/nacao-animal/actions/runs/39623127316) instalou dependências e aplicou as migrações com sucesso. Falhou em `npm test`: 211 testes aprovados e um reprovado.

O teste `tests/backend.integration.test.js` executava novamente todos os arquivos SQL, sem usar o histórico do migrador, depois de criar contas e notificações. Nessa repetição, a migração114 tentava restaurar a restrição antiga `notificacoes_tipo_check`, que não aceita `BOAS_VINDAS`, já criado pela117. PostgreSQL rejeitava a operação com23514. O problema era a simulação de segundo deploy no teste; não alterar migrações aplicadas para contorná-lo.

A execução do GitHub Pages no mesmo commit terminou com sucesso. Pages hospeda arquivos estáticos e não executa o servidor Node.js nem o PostgreSQL desta loja. Plataforma do deploy completo ainda não foi confirmada pelo usuário; não publicar em outro provedor por suposição.

## Correção local

Somente `tests/backend.integration.test.js` foi alterado: a preparação e o segundo deploy passam pelo `applyMigration` já usado em produção. Um cliente dedicado do schema temporário mantém transação e histórico na mesma conexão. A repetição verifica que nenhuma migração registrada foi reaplicada e conserva os testes de valor do pedido e quantidade de notificações.

Nenhum SQL ou código de produção foi alterado. Revisão independente do diff não encontrou problema bloqueante.

## Validação

- `RUN_DB_TESTS=1 npm test`:212 aprovados, zero falhas e zero ignorados, incluindo PostgreSQL real em schemas temporários.
- `npm run test:links`:38 páginas aprovadas.
- `npm audit --omit=dev --audit-level=high`:zero vulnerabilidades. A consulta precisou de permissão de rede por bloqueio do sandbox.
- Site local na porta4600 permaneceu disponível.

Integrações externas dos testes são simuladas. Não houve compra, pagamento ou envio de e-mail real, nem alteração dos dados da loja fora dos schemas isolados de teste.

## Próximo passo

A correção está na pasta local e ainda precisa ser enviada ao GitHub. Não houve commit, push, nova execução remota ou publicação nesta rodada. Reexecutar somente o commit antigo não inclui a correção. Depois de enviá-la, conferir uma nova execução da verificação antes de anunciar sucesso no GitHub.

Servidor existente preservado; não iniciar duplicatas. Contexto geral e credenciais separadas estão em `CONTINUAR-RECONSTRUCAO-05.md`; nunca imprimir chaves, tokens ou `.env`.
