# Continuidade — produção limpa e validação de pagamentos — 22/10/2026

Complementa o 12: Railway é demonstração; Vixpi é produção definitiva no plano escolhido pelo usuário. Manter os registros 11/10 para funcionalidades e restrições anteriores.

## Nova exigência explícita do usuário

A instalação definitiva na Vixpi deve começar limpa, sem clientes, produtos e demais dados de demonstração, preferencialmente apenas com o acesso administrativo e a configuração mínima da loja. Isso é uma definição para a futura publicação: não apagar dados locais nem do Railway agora.

Estratégia: PostgreSQL novo na Vixpi, sem restaurar backup/dump da demonstração. Criar estrutura por migrações e administrador exclusivo com senha forte própria de produção, sem reutilizar credenciais demonstrativas. Configuração mínima da empresa permanece necessária para relacionar o administrador à loja. Não copiar segredos em código/Git/chat.

## Auditoria da instalação atual — somente leitura

- db:migrate + db:seed-admin em banco novo não criam clientes, produtos, fornecedores, compras ou pedidos. Não executar seed-catalog, seed-demo-clients ou seed-test-products na produção.
- Porém 108_cupons.sql cria automaticamente PETFLOW10, ativo e público. A futura instalação limpa precisa de procedimento explícito para impedir que esse cupom de exemplo fique ativo. Não editar migração histórica/checksum nem apagar cupom/dados da instalação atual nesta rodada.
- Migrações 115/116 configuram identificação/contato/endereço/marca da empresa. Conferir dados definitivos com o proprietário em vez de assumir que toda configuração herdada é válida.
- seed-admin.js exige e-mail e senha com pelo menos 12 caracteres, maiúscula, minúscula, número e símbolo; salva hash bcrypt. Executar novamente para o mesmo e-mail redefine a senha e reativa o administrador: usar apenas na instalação ou em procedimento consciente de recuperação, não em cada reinício/deploy.
- Não foi localizado fluxo de troca obrigatória no primeiro acesso. Não prometer que já existe. Se adotado, será funcionalidade futura; administrador exclusivo com credencial forte pode ser criado pelo mecanismo atual.
- Nenhum script de migração/seed/limpeza foi executado. Nenhuma senha criada/trocada, banco acessado para mutação ou serviço publicado nesta rodada.

## Pergunta sobre pagamentos

Usuário perguntou se é melhor testar na Vixpi ou Railway e se seriam compras reais. Pergunta não autoriza executar cobranças, compras ou estornos agora. A solução definitiva de cartão/Pix ainda depende da contratação e implementação; provider segue pending, pagamentos desativados e sandbox.

Recomendação técnica a apresentar:

1. Desenvolver e testar a integração em sandbox local/Railway, com cenários e credenciais de teste do provedor e sem dinheiro real.
2. Ao preparar a Vixpi, repetir os testes de sandbox no endereço HTTPS definitivo para conferir callbacks/webhooks, notificações, pedido, estoque e financeiro no ambiente final.
3. Depois da integração e homologação, e com autorização explícita do responsável, fazer validação controlada de baixo valor em produção na Vixpi. Conferir cobrança aprovada pelo provedor, atualização do pedido/estoque/financeiro/e-mail e, quando apropriado, cancelamento/estorno acompanhado até seu estado confirmado. Limites e procedimentos dependem do serviço contratado; não prometer isenção de taxas ou prazo de estorno.

Quem determina sandbox versus cobrança real é a configuração/credencial/URL do provedor, não o nome da hospedagem. Seria tecnicamente possível cobrar no Railway, mas para este projeto a recomendação é reservar dinheiro real para a validação no destino definitivo.

Banco novo e limpo descreve o ponto de partida. Antes de vender/testar cobrança real, cadastrar ao menos o produto e os dados legítimos necessários. Uma operação financeira real gera histórico real; não fazer limpeza de demonstração para ocultar pedidos/transações reais. Manter demonstração, validação simulada e produção separadas.

Fonte primária consultada em 22/10/2026: https://developer.userede.com.br/ponto-partida — Rede oferece credenciais específicas e cenários em sandbox para testes, e o procedimento produtivo depende do pacote de API. A escolha de fazer a validação final na Vixpi é recomendação para este projeto, não exigência publicada pela Rede.

A ferramenta atual /sacola?teste=1 da Rede continua intencionalmente restrita a ambiente development/local. Não afirmar que já funciona pelo Railway: o checkout integrado hospedado ainda precisa ser implementado. Não remover essa proteção apenas para disponibilizar demonstração.

Somente documentos alterados nesta rodada; nenhuma nova execução de testes foi necessária. Última suíte: 377 testes, 373 aprovados, 0 falhas, 4 integrações PostgreSQL ignoradas. Preservar servidor local e demais restrições dos registros anteriores.
