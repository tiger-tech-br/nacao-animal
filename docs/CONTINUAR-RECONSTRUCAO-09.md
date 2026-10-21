# Continuidade — acesso móvel e cadastro administrativo — 21/10/2026

Este registro complementa o 08. O usuário perguntou se pode testar o administrador pelo celular, se o cadastro de clientes funciona e se as credenciais do `.env` correspondem ao administrador.

## Conferido

- HTTP 200 no login administrativo pelo localhost e pelo IP da rede, assim como no formulário administrativo de cadastro de clientes.
- Endereço para o celular na mesma rede: http://192.168.0.9:4600/admin/ . Computador e servidor precisam continuar ligados; IP pode mudar. Servidor preservado, sessão 72527, porta 4600.
- Conferência privada das credenciais com `SELECT` dentro de transação somente leitura e comparação bcrypt: ADMIN_EMAIL e ADMIN_PASSWORD presentes, usuário encontrado, ativo, perfil ADMIN e senha correspondente. Nenhum valor, e-mail, hash ou token foi exibido. Não foi feito POST de login, que atualizaria `ultimo_login`.
- Painel possui menu móvel até 1024px e formulário em uma coluna até 720px. Não houve inspeção visual em celular ou navegador, nem contorno do bloqueio anterior.

## Correção necessária encontrada e aplicada

Em `admin/pages/clientes/cadastrar.html`, o formulário enviava `celularWhatsapp`, mas o modelo lê `whatsapp` e a rota exige `telefone`. Salvar apenas os campos exigidos pela tela falhava, e o celular podia não ser persistido. CPF e e-mail também apareciam como opcionais, embora a API os exija.

- CPF/e-mail agora têm `required`.
- `whatsapp` recebe os dígitos do celular informado.
- `telefone` recebe o fixo informado ou usa o celular quando não há fixo.
- O campo intermediário `celularWhatsapp` não é enviado no payload.
- Sem mudanças nas regras da API, modelo ou dados reais; tema, menu, logout, endereço e CEP existentes preservados. O script é inline, portanto não há cache de arquivo JS externo a atualizar nesta correção.

`tests/admin-client-create-ui.test.js` agora tem oito testes: preserva os quatro anteriores e cobre obrigatoriedade, envio com celular apenas, envio com celular/fixo e preservação do formulário quando a API falha. Usa DOM/FormData/fetch simulados, sem criar cliente.

## Resultado

Suíte padrão: **288 testes, 284 aprovados, 0 falhas, 4 integrações PostgreSQL ignoradas**. HTML do formulário aceito pelo parser. Não foram executados cadastros reais, e-mails reais ou testes visuais autenticados. Não executada a suíte de banco com RUN_DB_TESTS=1 nesta rodada. Nenhuma mudança de credenciais, `.env`, banco real, migração, commit/push/deploy.

## Diferença entre os cadastros e pendência

- Cadastro administrativo exige sessão ADMIN e grava dados em `clientes`. Não cria senha nem acesso público, e não depende de confirmação por e-mail.
- Cadastro público em `/login` cria acesso, exige os campos, aceite de privacidade e serviço de e-mail configurado. Login depende de confirmação do e-mail. `APP_URL` deve ser acessível pelo aparelho que abrirá o link; localhost aponta para o próprio aparelho.
- Conferência privada adicional: serviço de e-mail tem as variáveis presentes, sem testar entrega; APP_URL ainda aponta para loopback. Portanto links de confirmação locais devem ser abertos no computador do servidor ou ter o endereço de teste adaptado conscientemente. Não foi alterado o `.env`.
- Pendência concreta: cadastro público recusa CPF/e-mail já presente em `clientes`, mesmo quando o registro administrativo não possui `usuarios_clientes`. Não alterado nesta rodada. Um eventual fluxo de ativação/vínculo deve verificar a posse da conta antes de liberar acesso; não simplesmente anexar registros de alguém que informe o mesmo CPF/e-mail.

## Esclarecimento de hospedagem

O usuário perguntou qual provedor era a indicação de VPS de 4 GB. Foi esclarecido: HostGator, plano VPS NVMe 4, com EasyPanel como sugestão de painel. Continua apenas uma recomendação; nenhum serviço foi contratado ou criado.
