# Continuidade — formulários administrativos — 21/10/2026

Este registro complementa o 10, que continua sendo referência para conta pública, e-mails, exclusão, privacidade e hospedagem. Leia o 10 antes de continuar outra etapa.

## Pedido e mudanças

Após esclarecer que Nação Animal ainda não foi publicado no Railway e PetFlow/outros são modelos, usuário pediu continuar. Rodada focada na organização administrativa solicitada anteriormente. Nenhuma ação na hospedagem ou nas credenciais.

- Páginas genéricas editáveis têm um botão na barra de ações com o título do formulário (por exemplo Registrar compra/Novo produto). Leva até o formulário preservando dados digitados; durante edição, diz Continuar edição. Não aparece em consultas somente leitura nem em Pedidos, que têm fluxo próprio.
- Editar preenche o registro e leva à seção do formulário, com foco no título e margem para cabeçalho fixo. Movimento respeita preferência por reduzir animações. Voltar à lista leva ao título da tabela; em Configurações, Ver dados atuais.
- Ações mostram Cancelar edição e Salvar alterações quando aplicável. Campos de descrição, JSON e foto ocupam largura total.
- Produto, Quantidade e Valor unitário (R$) têm rótulos associados aos controles dos itens de compra, visíveis no celular e acessíveis no desktop. Dados enviados e cálculo de total preservados.
- Títulos longos da barra superior quebram dentro do espaço disponível; botão Sair não encolhe. Barra de ferramentas/painéis permitem quebra.
- Mensagem de andamento/sucesso/erro fica junto ao formulário com região de status acessível. Enquanto a gravação aguarda, campos e ações ficam bloqueados, botão mostra Salvando..., editar/novo envio não alteram operação pendente. Estado original de controles desabilitados é restaurado.
- Erro de gravação mantém valores e ID em edição, permitindo corrigir/tentar novamente. Cliques repetidos durante a mesma requisição geram uma só chamada; isto não implementa idempotência de servidor para uma repetição posterior após perda de rede.
- Se gravação funciona e atualização da listagem falha, mensagem informa Registro salvo e orienta Atualizar, sem induzir outro cadastro como se a gravação tivesse falhado.

## Arquivos/cache

public/js/pages/admin/admin-page.js e public/css/layout/admin-theme.css; referências nas 16 páginas administrativas agora v20261021-3 para ambos. Dashboard.js continua v20261021-1; sua saudação e avatar da rodada anterior preservados.

Notificações: revisão identificou hipótese no painel antigo do dashboard, mas a fonte confirmou que notifications.js remove esse painel e usa .pf-notifications-panel já fixo. Não houve alteração desnecessária no painel legado.

## Validação

- Novo tests/admin-record-form-ui.test.js: 8 testes simulados. Atalho preservando valores/retorno/foco, edição/redução de movimento, duplo envio com API pendente, falha mantendo dados/registro e restauração dos controles, atualização de lista falhando após gravação, PUT das configurações e exclusão de páginas somente leitura/Pedidos do fluxo genérico.
- Suíte padrão completa: 377 testes, 373 aprovados, 0 falhas, 4 integrações PostgreSQL ignoradas.
- Links estáticos: 40 páginas aprovadas. JS válido, parsing de CSS/HTML e diff conferidos.
- Sem cadastro/compra/e-mail real, banco real, migração, alteração de .env, contratação, commit/push/deploy. Não foi necessário repetir integração PostgreSQL nesta rodada, pois mudanças estão na interface; última execução isolada registrada no 10 permanece válida para aquela etapa.
- Inspeção do navegador continua bloqueada por restrição anterior: não contornar nem afirmar teste visual. Revisão por fonte/DOM simulado/HTTP. Usuário pode conferir a aparência no próprio aparelho.

## Servidor e preservação

Preservar npm run dev na porta 4600, sessão 72527, sem duplicatas. Site http://localhost:4600/ e admin http://localhost:4600/admin/ . Celular na mesma rede http://192.168.0.9:4600/ (IP pode mudar).
Usuário fez commit externo c0bd975 update antes desta rodada. Preserve todas as alterações; não fazer commit/push/deploy sem pedido. Pagamentos DESATIVADOS/pending/sandbox. Nunca exibir .env/segredos nem testar com compras/cadastros/e-mails reais.

Próximas etapas: conferir apresentação administrativa com o usuário, seguir módulos/pedidos reais de desenvolvimento, manter fluxos públicos e LGPD do registro 10. Cadastro sem confirmação de e-mail, boas-vindas uma vez após cadastro, recuperação e avisos de pedidos permanecem. Ativação pública de cliente previamente criado no painel e entrega real de e-mails ainda são pendências documentadas.
Railway não foi consultado novamente nesta rodada. Não afirmar status atual com base em consulta antiga; Nação Animal ainda local conforme confirmação explícita do usuário.