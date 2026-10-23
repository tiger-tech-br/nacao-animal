# Continuidade — demonstração no Railway e produção na Vixpi — 22/10/2026

Este registro complementa os registros 11 e 10. A definição abaixo prevalece sobre menções antigas ao Railway como hospedagem definitiva.

## Decisão explícita do usuário

- Nação Animal será colocado no **Railway para demonstração ao cliente**. O usuário reforçou que é somente para mostrar o projeto funcionando; não descartar essa etapa.
- A hospedagem **definitiva será Vixpi**, no plano de **R$ 39,90/mês** escolhido pelo usuário por caber no orçamento.
- PetFlow e outros projetos no Railway também são modelos/demonstrações.
- Usuário informou que o problema do Railway foi resolvido. O status da plataforma não foi consultado novamente nesta rodada; não apresentar a consulta antiga de 21/10 como status atual.
- Esta rodada apenas registra a decisão e confere compatibilidade por fonte pública e código. Não houve criação de conta, contratação, publicação, importação de variáveis ou mudança de banco/credenciais. Não afirmar que a demonstração já está no ar.

## Compatibilidade conferida

Fonte oficial consultada em 22/10/2026: https://vixpi.host/sites . O plano Site Pro está anunciado por R$ 39,90/mês, com Node.js, PostgreSQL, 2 GB de RAM, 2 núcleos, 30 GB NVMe, variáveis de ambiente e HTTPS. A página informa versões Node 22 e 24. A RAM do plano é distribuída entre aplicação, banco e cache: não tratar como 2 GB exclusivos para cada componente.

Código local:

- package.json exige Node >=22; instalação npm ci e inicialização npm start.
- Servidor escuta em 0.0.0.0 e usa PORT (padrão local 4600).
- PostgreSQL aceita DATABASE_URL ou variáveis DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD. DB_EXPECTED_NAME deve corresponder ao banco de cada ambiente.
- RAILWAY_PUBLIC_DOMAIN é fallback, não dependência obrigatória. APP_URL deve apontar para o HTTPS do ambiente que estiver sendo publicado.
- railway.json existente mantém pre-deploy de migrações e healthcheck /api/health para a demonstração. Não removido nem modificado.
- O mesmo código pode ser configurado nos dois provedores; desempenho/capacidade reais ainda exigem validação no ambiente escolhido. Não há justificativa para refazer páginas/layout ou converter para outro banco apenas pela escolha da hospedagem.

Na preparação da demonstração, manter dados de teste e pagamentos desativados/sandbox. Configuração e banco da demonstração devem ser separados dos dados definitivos. Na publicação final, usar credenciais, banco, domínio e endereços de retorno adequados à Vixpi; não copiar automaticamente valores locais de conexão ou APP_URL.

## Pendências funcionais confirmadas na revisão anterior

O usuário perguntou o que falta além dos pagamentos; foi respondido após revisão por leitura. Não foram implementados os itens abaixo nesta rodada:

1. Dar baixa em contas de fornecedor: compras geram PAGAR/PENDENTE; FinanceiroService.pagar existe, mas não há rota/ação para essa baixa. Edição genérica bloqueia lançamentos automáticos.
2. Atendimento e LGPD precisam de modo para responder registros existentes. Formulário genérico oferece criação/exclusão incompatíveis com rotas GET/PUT; exigir seleção antes de salvar e remover ações inválidas.
3. Exclusão adiada por pedido ativo: marcar protocolo ATENDIDA não executa a remoção/anonimização. Falta procedimento administrativo efetivo após encerrar o impedimento.
4. Cliente cadastrado pelo painel ainda não consegue ativar acesso público pelo cadastro comum; eventual solução deve comprovar posse, não anexar registros simplesmente por CPF/e-mail.
5. Validar entrega real dos e-mails e links (boas-vindas uma vez após cadastro, recuperação, avisos de pedido, exclusão). Não reintroduzir confirmação de cadastro. Envio opcional não tem fila persistente/reenvio automático; isso é melhoria operacional, não requisito novo obrigatório.
6. Publicar demonstração e depois produção, conferir domínio/HTTPS/Google APIs, testar operação completa e GPS em celular. Preparar catálogo e estoque definitivos quando for vender.
7. Configurar rotina de backup e ensaiar restauração em banco separado. Atualizar documentação antiga que ainda cita PetFlow, confirmação de e-mail e pagamento legado. Usuário quer depois entender todas as páginas administrativas com exemplos.

Checagem local de publicação anterior: 29/35 verificações aprovadas. Falhas eram modo de desenvolvimento, APP_URL local, três verificações de pagamentos e e-mail público da empresa ausente. Não mudar ambiente local para production apenas para aprovar a checagem; não confundir credenciais presentes com provedores homologados.

Última suíte completa, sem mudanças de código desde então: 377 testes, 373 aprovados, 0 falhas, 4 integrações PostgreSQL ignoradas; links de 40 páginas aprovados. Não repetida por mudança somente documental.

Preservar servidor local existente, sem duplicatas, e as regras dos registros 11/10: sem compras/cadastros/e-mails reais para testes, sem exibir segredos/.env, sem reaplicar migração 117 nem semear produtos, sem commit/push sem pedido. Não contornar o bloqueio anterior de inspeção do navegador. Último commit externo observado: 053770c update; preservar alterações.
