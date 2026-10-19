# Nação Animal — loja de produtos

Para instalação e entrega comercial, consulte [o guia do comprador](docs/entrega-comercial.md). Para validar uploads, consulte [Cloudinary](docs/cloudinary.md). Instale Node.js 22 ou superior, execute `npm ci` e copie `.env.example` para `.env` antes de configurar o banco e as integrações.

Para preparar Pix e cartão com recebimento no Itaú, consulte [o guia de pagamentos](docs/pagamentos-itau.md). Os campos reservados não habilitam cobranças: os pagamentos ficam desativados enquanto a solução é definida e os adaptadores Rede/Itaú ainda precisam ser implementados.

O [passo a passo de cadastro Itaú/Rede](docs/cadastro-itau-rede.md) separa as
ações do proprietário e do desenvolvedor, desde a contratação até a produção.
O andamento e os próximos passos estão em [pendências de publicação](docs/pendencias-publicacao.md).

Versão voltada a um petshop com venda de produtos. Mantém catálogo, sacola,
conta do cliente, pedidos, pagamentos, clientes, produtos, estoque, fornecedores,
compras e financeiro. Serviços, agenda, cadastro de pets e módulo de funcionários não
estão disponíveis nas páginas ou APIs desta versão. O lembrete de atendimentos
também não é iniciado.

## Banco separado no PostgreSQL local

1. No pgAdmin, conecte-se ao PostgreSQL local.
2. Use o banco **nacao-animal**. Se ele já foi criado, prossiga para a configuração.
   Caso ainda não exista, clique com o botão direito em **Databases → Create → Database**
   e use esse nome. Alternativamente, execute `database/create-nacao-animal.sql`
   no Query Tool conectado ao banco de manutenção `postgres`, sem uma transação.
3. Configure `DB_NAME=nacao-animal` e `DB_EXPECTED_NAME=nacao-animal` no `.env`.
   Preencha `DB_PASSWORD` com a senha do seu PostgreSQL. Se necessário,
   ajuste `DB_USER`, `DB_HOST` e `DB_PORT`. O `.env` não é versionado.
4. Mantenha `DATABASE_URL`, `POSTGRES_URL` e `DATABASE_PUBLIC_URL` vazias para
   usar a conexão local. Essas URLs têm precedência sobre `DB_NAME`.
5. Execute:

   ```sh
   npm run db:migrate
   npm run db:seed-admin
   npm start
   ```

Configure `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `.env` antes de criar o administrador.
Para carregar produtos de demonstração, execute opcionalmente
`npm run db:seed-catalog`. Não é necessário copiar dados do banco original.

A loja abre em **http://localhost:4600** e o painel em
**http://localhost:4600/admin/**. A porta distinta também separa as sessões do
navegador da instalação original na porta 4500.

Por padrão, as conexões da aplicação e dos scripts exigem o nome `nacao-animal`;
outros bancos são recusados antes da conexão, a menos que o nome esperado seja
configurado em `DB_EXPECTED_NAME`, como no Railway. Nunca aponte esta cópia para
o banco original. As migrações do banco novo não criam tabelas de pets, serviços, agendamentos,
consultas, prontuários, vacinas ou funcionários. Nenhuma tabela de bancos existentes é apagada.

## Railway

Crie um projeto novo para a Nação Animal e adicione um serviço PostgreSQL nele.
No serviço da aplicação, configure `DATABASE_URL` com a referência privada
`${{Postgres.DATABASE_URL}}` e `DB_EXPECTED_NAME` com
`${{Postgres.PGDATABASE}}`. Assim a aplicação confirma que a URL aponta para
o banco criado naquele projeto, mesmo que o Railway use o nome padrão
`railway` em vez de `nacao-animal`.

Não use `DATABASE_PUBLIC_URL` entre a aplicação e o PostgreSQL. O arquivo
`railway.json` executa `npm run db:migrate` antes de cada deploy. Ainda é
necessário definir no Railway `JWT_SECRET`, `JWT_EXPIRES_IN`, `APP_URL` e
`FRONTEND_URL`. Cloudinary atende os uploads de imagens; Resend é necessário para cadastro e recuperação de senha. O código herdado usa PagBank, mas os pagamentos desta instalação aguardam a definição e implementação da nova integração descrita no guia de pagamentos. Configure também as chaves do Google Maps para frete e mapa.

Configure `EMAIL_FROM` com o remetente da Nação Animal verificado no Resend.
Sem um remetente explícito, o sistema mantém os envios indisponíveis; nenhum
e-mail de suporte de outra instalação é usado automaticamente.

## Verificação

```sh
npm test
```

Os testes verificam isolamento do banco, dados comerciais do painel e rotas
públicas/administrativas. A validação de compras e pagamentos com dados reais
depende de configurar o novo banco e as integrações próprias desta loja.

Para testar também o PostgreSQL local, use `RUN_DB_TESTS=1 npm test` no Git Bash.
No PowerShell, use `$env:RUN_DB_TESTS='1'` e depois `npm test`.
Os testes de banco criam schemas temporários próprios e os removem ao terminar.
Incluem login administrativo, cadastro e edição de produto, movimentação e
validações de estoque, painel e catálogo. Fotos e demais provedores externos são
simulados nesses testes; o upload real pode ser conferido com
`npm run check:cloudinary -- --upload`.

O resultado da preparação desta instalação está em
[validação local](docs/validacao-local.md).

## Frete por distância e GPS de entrega

Na sacola (`/sacola`), o cliente confere o endereço salvo, toca em **Calcular frete** e vê produtos, frete e total antes de **Ir para pagamento**. Os atalhos de compra do catálogo levam a essa mesma tela. A cotação vale por 15 minutos e precisa ser refeita se o endereço mudar. O preço e a distância enviados pelo navegador não são aceitos como valores de cobrança.

Origem padrão: **Avenida Novo Horizonte, 256, Vila Sacadura Cabral, Santo André, SP, 09060-820, Brasil**. Para alterar, defina `DELIVERY_ORIGIN_ADDRESS` no serviço da aplicação.

Regra: até 1.000 metros grátis; acima disso, R$ 3 por quilômetro adicional ou fração (`ceil((metros - 1000) / 1000) * 3`). Exemplos: 1 km = grátis; 1,5 km = R$ 3; 2 km = R$ 3; 2,5 km = R$ 6. É a distância da rota de carro calculada pelo Google Maps, não distância em linha reta ou leitura do GPS do cliente. No código de checkout herdado, o PagBank recebe o frete em centavos, uma única vez, no objeto `shipping`; esse envio precisará ser adaptado ao novo provedor. Pedidos antigos mantêm frete zero.

### Ativar no Railway

1. No projeto Google Cloud, habilite faturamento e **Routes API**. Crie uma chave de servidor restrita à Routes API e configure `GOOGLE_MAPS_API_KEY` nas variáveis do serviço da **Nação Animal** (não no PostgreSQL nem em JavaScript público).
2. Configure `APP_URL` com a origem HTTPS da nova aplicação no Railway ou o domínio próprio da Nação Animal e confira a origem da entrega. Não reutilize a URL de outra instalação.
3. Publique as alterações. O pre-deploy existente executa `npm run db:migrate`, incluindo `107_frete_rastreamento.sql`. Configure a chave antes de publicar: sem ela, novas compras com entrega ficam bloqueadas na cotação; o sistema não assume frete grátis quando o Google falha. A configuração do frete não habilita os pagamentos pendentes desta instalação.
4. Na futura integração de pagamentos, valide a distância para um endereço conhecido e confira frete e total no provedor escolhido antes de pagar. Os testes do código herdado simulam Google Maps e PagBank e não comprovam a integração com Rede/Itaú nem uma cobrança real.

Referências: [Google Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions), [objeto Checkout do PagBank usado no código herdado](https://developer.pagbank.com.br/reference/objeto-checkout).

### Compartilhar o GPS

1. No painel **Pedidos**, selecione o pedido, marque **Saiu para entrega** e abra os detalhes.
2. Toque em **Gerar link para o entregador**, copie o link e entregue-o apenas ao responsável. O link vale 12 horas, permite somente publicar/parar a posição daquele pedido e é substituído quando um novo é gerado. O segredo fica no fragmento da URL e seu hash é armazenado no banco.
3. No celular, o entregador abre o link por HTTPS, toca em **Iniciar compartilhamento** e autoriza o GPS. As posições são enviadas a cada 30 segundos. Mantenha a página aberta e a tela ativa; o navegador pode suspender o GPS em segundo plano ou com a tela bloqueada.
4. O cliente acessa **Meus pedidos → Acompanhar entrega por GPS**. A consulta exige login e acesso ao próprio pedido. O mapa identifica a última atualização e avisa após 2 minutos sem posição recente.
5. **Parar e encerrar link** revoga o acesso e remove a posição. Concluir ou cancelar a entrega também remove a posição e revoga o link. A expiração impede publicação e consulta, mesmo que o pedido ainda esteja em entrega. Fechar a página interrompe novos envios, mas não equivale a concluir a entrega; o cliente verá o aviso de posição desatualizada.

GPS não calcula prazo de chegada e não funciona como rastreador nativo em segundo plano. Não há histórico de percurso. A posição é exibida em Google Maps e exige GOOGLE_MAPS_BROWSER_API_KEY restrita ao domínio. A API Routes é usada apenas para cotar frete.

### Testes de integração locais

```powershell
$env:RUN_DB_TESTS='1'
npm test
```

O teste recusa bancos fora de localhost/127.0.0.1 e usa schema temporário em `nacao-animal`. Cobre cadastro, frete, adulteração de valores, mudança de endereço, checkout, webhook, GPS, acesso de outro cliente, revogação e reaplicação das migrações sem perder o frete. Os provedores externos são simulados.
