# Continuidade — contas e organização do administrador — 21/10/2026

Este registro prevalece sobre o 09 quanto à confirmação de e-mail. Consulte 08/07/06 para etapas anteriores. Preserve alterações e visual aprovados; sem commit/push/deploy sem pedido.

## Acesso preservado

Servidor sessão 72527, npm run dev, porta 4600, sem duplicatas. Site http://localhost:4600/ e admin http://localhost:4600/admin/ . Celular na mesma rede http://192.168.0.9:4600/ (IP pode mudar). Inicial, login, clientes, compras, dashboard e admin pela rede responderam 200 na última conferência. Não afirmar validação visual: inspeção do navegador foi bloqueada anteriormente; não contornar com outra ferramenta.

## Conta pública e e-mails

- Usuário pediu cadastro SEM confirmação de e-mail. Login é imediato, incluindo contas antigas não verificadas. email_verificado permanece FALSE; formato válido não comprova existência da caixa postal.
- Cadastro preserva aceite de privacidade, hash e checagens de duplicidade. Boas-vindas opcional enviado somente após commit do cadastro, com idempotência welcome/clienteId. Falha no envio não desfaz cadastro. Login não reenvia.
- Rotas legadas de confirmar/reenviar retornam 410. Tela não exige confirmação nem chama rota antiga; parâmetro verificar_email é removido.
- Recuperação de senha e e-mails dos pedidos preservados por pedido explícito. Entrega real não testada; APP_URL ainda loopback, então links abertos pelo celular precisam de endereço acessível. Nenhuma alteração no .env.
- Cadastro administrativo cria cliente sem acesso público. Pendência: público recusa CPF/e-mail/telefone de cliente já criado pelo painel mesmo sem conta vinculada; futura ativação deve comprovar posse, não simplesmente anexar por CPF/e-mail.

## Saudação, modal e privacidade

- Cabeçalho e inicial mostram Olá, <primeiro nome>!, nome real via textContent, avatar e Sair.
- Novo customer-logout-dialog.js/CSS compartilhado nas 20 páginas públicas: Deseja sair da sua conta?, Continuar na conta / Sim, sair. Cancelar recebe foco, Escape cancela, foco retorna ao acionador e chamadas duplicadas compartilham promessa. Fallback seguro para confirmação nativa.
- Saída só executa após confirmação e se token não mudou; revoga sessão em melhor esforço, limpa token/usuário/favoritos/carrinho/endereço/cupom de local/sessionStorage e preserva sessão administrativa.
- Carrinho aborta CEP/perfil, ignora respostas antigas e limpa cotação/endereço/cupom. Sidebar encaminha evento de logout, descarta iframe e recarrega documento na próxima abertura; guards de origem/fonte mantidos.

## Exclusão

- Interface explica pedidos em andamento e retenção mínima de registros necessários por obrigação legal; bloqueia repetições e ignora resultado de sessão antiga.
- Pedido ativo: retorna 202 com protocolo, mantém conta e não envia e-mail de conta excluída. Execução posterior depende de análise, não é automática após entrega.
- Exclusão efetiva trava linha do cliente, remove acesso/cadastro/newsletter/notificações/rastreamento, limpa referências pessoais em solicitações/auditoria e anonimiza endereço/observações dos pedidos; preserva valores/identificadores financeiros necessários.
- E-mail opcional somente após commit, chave account-deleted/clienteId. Falha não restaura conta. Não prometer apagar dados em backups/provedores externos.
- Corrigido cast em subconsulta de auditoria: parâmetro textual da entidade usa ::uuid ao comparar vendas.cliente_id. Testado fluxo de exclusão real apenas em schema isolado.

## Administrador

- admin-theme.css: listas/formulários usam largura total, formulário abaixo da lista; campos em duas colunas ou uma no celular, sem painel Registrar compra cortado nem coluna vazia.
- Tabelas sem largura mínima fixa, texto quebra. Até 1100px, tabelas genéricas viram cartões com rótulos data-label; pedidos preservam apresentação própria.
- Itens de compra, painéis e campos adaptam larguras com min-width 0. Avatar A circular de 40x40, centralizado e com espaçamento; perfil/sino reorganizados em telas pequenas.
- Dashboard mostra exatamente Olá, Admin!.
- Cache nas 16 páginas: admin-theme.css e admin-page.js v20261021-2; dashboard.js v20261021-1.
- Barra vertical do menu continua permitindo acesso às seções; tratado o problema de rolagem horizontal do conteúdo. Não houve inspeção visual autenticada.

## Validação

- Suíte padrão: 369 testes, 365 aprovados, 0 falhas, 4 integrações PostgreSQL ignoradas.
- Separadamente RUN_DB_TESTS=1 node --test tests/backend.integration.test.js: 1 aprovada. Schema isolado protegido e limpo, provedores simulados. Cadastro sem confirmação, login imediato/legado, boas-vindas uma vez/falha, reset/expiração/revogação, pedidos/estoque/webhooks, exclusão pendente sem e-mail e efetiva concorrente com só uma tentativa de e-mail após commit. Confere acesso removido e anonimização preservando valores. Primeiro erro UUID=text foi corrigido; execução final passou.
- Modal: 18 testes. Coberturas adicionais de conta/cabeçalho, privacidade do carrinho e descarte do iframe. Links: 40 páginas aprovadas. Sintaxe/parsers e diff conferidos.
- Sem cadastro/compra/exclusão/e-mail real, migração, mudança no .env, importação de variáveis ou deploy nesta rodada.

## Railway — consulta oficial em 21/10 às 20h35 Brasília

Deploys ainda pausados, sem previsão: confirmação às 19h37; última atualização 19h45 tratava da revogação de credenciais de buckets. Railway divulgou incidente de segurança e recomenda revogar/substituir segredos armazenados na plataforma e revisar logs. Orientação aplica-se às credenciais efetivamente armazenadas lá, sem implicar acesso ao .env apenas local. Não revogamos chaves automaticamente nem mudamos hospedagem.
Fontes: https://status.railway.com/ e https://blog.railway.com/p/security-disclosure-wednesday-october-21st . Consultar novamente para status futuro.
Usuário paga Hobby US$ 5 e quer nome nacao-animal. Tentativas anteriores de criar destino/importar 42 variáveis falharam: nada importado por este agente nem destino confirmado; usuário pode ter feito ações independentes. Perguntas de hospedagem não autorizam contratação/migração.

## Preservar

Visual amarelo/laranja da quarta referência, logo/animais, sem Blog, carrossel automático sem pausa, banner Dog Walker e contatos/rodapé aprovados. Não gerar imagens/semear/repor produtos novamente. Pagamentos DESATIVADOS, provider pending, sandbox. Chaves Google distintas; nunca exibir segredos/tokens/.env/mapa-config bruto. Migração 117 já aplicada, não repetir.
Usuário fez commit externo 85a87aa update durante o trabalho. Alterações posteriores de layout, cast SQL, teste de exclusão e documentos permanecem locais. Agentes auxiliares atingiram limite de uso e usuário foi avisado; root concluiu correções/testes. Priorizar apresentação administrativa com o usuário, entrega de e-mails em etapa autorizada e hospedagem quando recuperada/decidida. Não restaurar confirmação de e-mail.