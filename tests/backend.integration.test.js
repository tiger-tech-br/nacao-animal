"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");

test("cadastro, confirmação, compra, webhook e estoque em PostgreSQL isolado", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
    require("dotenv").config({ quiet: true });
    const { Pool } = require("pg");
    const { buildDbOptions } = require("../config/dbOptions");
    const options = buildDbOptions();
    const target = options.connectionString ? new URL(options.connectionString) : null;
    assert.ok(["localhost", "127.0.0.1"].includes(target?.hostname || options.host), "Teste restrito ao PostgreSQL local");
    assert.equal(target ? decodeURIComponent(target.pathname.slice(1)) : options.database, "nacao-animal");
    const schema = `test_backend_${crypto.randomBytes(8).toString("hex")}`;
    const admin = new Pool(options);
    let pool, server;
    const originalFetch = global.fetch;
    try {
        await admin.query(`CREATE SCHEMA "${schema}"`);
        pool = new Pool({ ...options, options: `-c search_path=${schema},public` });
        for (const file of fs.readdirSync("database/sql").filter(f => f.endsWith(".sql")).sort()) {
            await pool.query(fs.readFileSync(`database/sql/${file}`, "utf8"));
        }
        process.env.JWT_SECRET = "isolated-integration-test-secret";
        process.env.JWT_EXPIRES_IN = "1h";
        process.env.PAGSEGURO_TOKEN = "isolated-test-token";
        process.env.PAGSEGURO_BASE_URL = "https://sandbox.api.pagseguro.com";
        process.env.PAYMENTS_ENABLED = "true";
        process.env.PAYMENT_PROVIDER = "pagbank";
        process.env.PAYMENT_ENVIRONMENT = "sandbox";
        process.env.APP_URL = "http://localhost";
        process.env.NODE_ENV = "test";
        process.env.GOOGLE_MAPS_API_KEY = "test-maps-key";
        delete process.env.DELIVERY_ORIGIN_ADDRESS;
        process.env.GOOGLE_MAPS_BROWSER_API_KEY = "test-public-browser-key";
        let routeCalls = 0;
        global.fetch = async (url, options) => {
            if (!String(url).startsWith("https://routes.googleapis.com/")) return originalFetch(url, options);
            if (options.headers["X-Goog-FieldMask"].includes("polyline")) {
                routeCalls++;
                const body = JSON.parse(options.body);
                assert.equal(body.origin.location.latLng.latitude, -23.66, "Rota parte da posição GPS do entregador");
                assert.equal(body.origin.address, undefined, "Frete usa loja; navegação usa GPS");
                assert.match(body.destination.address, /Rua de Teste/, "Rota usa endereço congelado do pedido, não perfil editado");
            }
            return { ok: true, json: async () => ({ routes: [{ distanceMeters: 2500, duration: "500s", polyline: { encodedPolyline: "test-route" }, legs: [{ startLocation: { latLng: { latitude: -23.66, longitude: -46.55 } }, endLocation: { latLng: { latitude: -23.67, longitude: -46.56 } } }] }] }) };
        };
        require.cache[require.resolve("../config/db")] = { exports: { pool } };
        const email = require("../services/emailService");
        const sent = [];
        let emailFailure = true;
        email.assertEmailConfigured = () => {};
        email.sendEmail = async payload => {
            if (emailFailure) throw Object.assign(new Error("Provedor indisponível"), { status: 503 });
            sent.push(payload);
            return { id: "test-email" };
        };
        const optionalEmails = [];
        email.sendOptionalEmail = async payload => { optionalEmails.push(payload); return { id: "test-optional" }; };
        let checkouts = 0;
        require("axios").create = () => ({
            post: async (url, checkout) => {
                checkouts++;
                assert.equal(checkout.shipping.amount, 600, "PagBank recebe frete em centavos");
                assert.equal(checkout.shipping.type, "FIXED");
                assert.equal(checkout.discount_amount, 250, "PagBank recebe o desconto salvo, em centavos");
                assert.equal(checkout.shipping.address.street, "Rua de Teste", "Usa endereço congelado na compra");
                return { data: { id: "CHEC_TEST", status: "ACTIVE", links: [{ rel: "PAY", href: "https://example.invalid/test-checkout" }] } };
            },
            get: async () => ({ data: { id: "CHEC_TEST", status: "ACTIVE", charges: [{ status: "PAID" }] } })
        });
        const app = require("../app");
        server = app.listen(0, "127.0.0.1");
        await new Promise(resolve => server.once("listening", resolve));
        const base = `http://127.0.0.1:${server.address().port}`;
        const mapPage = await fetch(base + "/acompanhar-entrega");
        assert.equal(mapPage.status,200);
        assert.equal(mapPage.headers.get("referrer-policy"),"strict-origin-when-cross-origin");
        assert.ok(mapPage.headers.get("content-security-policy").includes("'unsafe-eval'"));
        const adminMapPage = await fetch(base + "/admin/acompanhar-entrega?pedido=example");
        assert.equal(adminMapPage.status,200);
        assert.equal(adminMapPage.headers.get("cache-control"),"no-store");
        assert.equal(adminMapPage.headers.get("referrer-policy"),"strict-origin-when-cross-origin");
        assert.ok(adminMapPage.headers.get("content-security-policy").includes("'unsafe-eval'"));
        assert.match(await adminMapPage.text(),/id="trackingTitle"/);
        const homePage = await fetch(base + "/");
        assert.ok(!homePage.headers.get("content-security-policy").includes("'unsafe-eval'"), "Exceção do Google restrita às páginas de mapa");
        async function request(path, method = "GET", body, token, headers = {}) {
            const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
            return { status: res.status, body: await res.json(), headers: res.headers };
        }
        const storeInfo = await request("/api/public/loja");
        assert.equal(storeInfo.status, 200);
        assert.ok(storeInfo.body.data.nome, "Dados publicos da loja usam a empresa cadastrada");
        assert.equal((await request("/api/health")).status, 200);
        const customer = { nome: "Teste Isolado", cpf: "52998224725", telefone: "11999999999", email: "integration@example.invalid", senha: "Teste12345", cep: "01001000", endereco: "Rua de Teste", numero: "10", bairro: "Centro", cidade: "São Paulo", estado: "SP", aceite_privacidade: true };
        assert.equal((await request("/api/public/clientes/cadastro", "POST", { ...customer, aceite_privacidade: false })).status, 400,
            "Cadastro exige aceite expresso da politica de privacidade");
        let res = await request("/api/public/clientes/cadastro", "POST", customer);
        assert.equal(res.status, 503);
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM clientes")).rows[0].n, 0, "Envio falhou: nenhum cliente órfão");
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM usuarios_clientes")).rows[0].n, 0);
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM notificacoes_admin")).rows[0].n, 0, "Cadastro revertido não deixa aviso órfão");
        emailFailure = false;
        res = await request("/api/public/clientes/cadastro", "POST", customer);
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(sent.length, 1);
        assert.equal((await request("/api/public/clientes/login", "POST", customer)).status, 403);
        await pool.query("UPDATE usuarios_clientes SET token_verificacao_expiracao = NOW() - INTERVAL '1 day'");
        res = await request("/api/public/clientes/reenviar-confirmacao", "POST", { email: customer.email });
        assert.equal(res.status, 200);
        const verification = (await pool.query("SELECT token_verificacao_email FROM usuarios_clientes")).rows[0].token_verificacao_email;
        assert.equal((await request("/api/public/clientes/verificar-email", "POST", { token: verification })).status, 200);
        res = await request("/api/public/clientes/login", "POST", customer);
        assert.equal(res.status, 200);
        const token = res.body.data.token;
        const empresaId = res.body.data.user.empresaId;
        const adminId = (await pool.query("INSERT INTO usuarios(nome,email,senha_hash,perfil,empresa_id) VALUES ('Admin','admin@example.invalid','test','ADMIN',$1) RETURNING id", [empresaId])).rows[0].id;
        assert.equal((await request("/api/public/clientes/me", "GET", null, token)).status, 200);
        assert.equal((await request("/api/public/clientes/cadastro", "POST", customer)).status, 409);
        const categoria = (await pool.query("INSERT INTO categorias (empresa_id,nome) VALUES ($1,'Teste') RETURNING id", [empresaId])).rows[0].id;
        const product = (await pool.query("INSERT INTO produtos (empresa_id,categoria_id,nome,sku,preco,custo,preco_venda,preco_custo) VALUES ($1,$2,'Produto Teste','TEST',12.50,5,12.50,5) RETURNING id", [empresaId,categoria])).rows[0].id;
        await pool.query("INSERT INTO estoque (empresa_id,produto_id,quantidade) VALUES ($1,$2,10) ON CONFLICT (empresa_id,produto_id) DO UPDATE SET quantidade=10", [empresaId,product]);
        const payload = { itens: [{ produtoId: product, quantidade: 2, preco: 0.01 }], formaPagamento: "PAGBANK" };
        assert.equal((await request("/api/public/pedidos", "POST", payload)).status, 401);
        assert.equal((await request("/api/public/pedidos", "POST", payload, token)).status, 409, "Frete deve ser cotado antes de comprar");
        const quote = await request("/api/public/frete/cotar", "POST", {}, token);
        assert.equal(quote.status, 200, JSON.stringify(quote.body));
        assert.equal(quote.body.data.valor, 6);
        payload.freteToken = quote.body.data.token;
        payload.valor_frete = 0; // Não deve ser confiado pelo servidor.
        payload.desconto = 999;
        const couponBody = { codigo: "petflow10", itens: [{ produto_id: product, quantidade: 2, preco: .01 }] };
        assert.equal((await request("/api/public/cupons/consultar", "POST", couponBody)).status, 401);
        const preview = await request("/api/public/cupons/consultar", "POST", couponBody, token);
        assert.equal(preview.status, 200, JSON.stringify(preview.body));
        assert.equal(preview.body.data.produtos, 25);
        assert.equal(preview.body.data.cupom.desconto, 2.5);
        assert.equal(preview.body.data.disponiveis[0].codigo, "PETFLOW10");
        payload.cupomCodigo = "PETFLOW10";
        await pool.query("UPDATE cupons SET ativo=FALSE WHERE codigo='PETFLOW10'");
        assert.equal((await request("/api/public/pedidos", "POST", payload, token)).status, 400, "Revalida cupom ao comprar");
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM vendas")).rows[0].n, 0, "Pedido inválido é revertido");
        await pool.query("UPDATE cupons SET ativo=TRUE WHERE codigo='PETFLOW10'");
        res = await request("/api/public/pedidos", "POST", payload, token);
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const order = res.body.data.id;
        assert.equal(Number(res.body.data.valor_final), 28.5, "Produtos 25 - desconto 2,50 + frete 6; valores do navegador são ignorados");
        assert.equal(Number(res.body.data.desconto), 2.5);
        assert.equal(res.body.data.cupom_codigo, "PETFLOW10");
        await pool.query("UPDATE cupons SET valor=20 WHERE codigo='PETFLOW10'");
        assert.equal(Number(res.body.data.valor_frete), 6);
        const deliveryAddress = { endereco: "Rua do Visitante", numero: "123", bairro: "Centro", cidade: "Santo André", estado: "SP", cep: "09000000" };
        const guestQuote = await request("/api/public/frete/cotar", "POST", { endereco: deliveryAddress });
        assert.equal(guestQuote.status, 200, JSON.stringify(guestQuote.body));
        assert.equal(guestQuote.body.data.valor, 6, "Visitante calcula a entrega sem conta");
        const guestOrder = await request("/api/public/pedidos", "POST", {
            ...payload, cupomCodigo: null, freteToken: guestQuote.body.data.token, enderecoEntrega: deliveryAddress
        }, token);
        assert.equal(guestOrder.status, 201, JSON.stringify(guestOrder.body));
        assert.equal(Number(guestOrder.body.data.desconto), 0, "Desconto arbitrário do navegador é ignorado sem cupom");
        assert.equal(Number(guestOrder.body.data.valor_final), 31);
        assert.equal(guestOrder.body.data.endereco_entrega.endereco, deliveryAddress.endereco, "Pedido usa endereço cotado, não outro endereço do perfil");
        const supportRequest = await request(`/api/public/clientes/pedidos/${guestOrder.body.data.id}/solicitacoes`, "POST",
            { tipo: "CANCELAMENTO", motivo: "Desisti desta compra antes da entrega." }, token);
        assert.equal(supportRequest.status, 200, JSON.stringify(supportRequest.body));
        assert.match(supportRequest.body.data.protocolo, /^ATD-/);
        assert.equal((await pool.query("SELECT status FROM vendas WHERE id=$1", [guestOrder.body.data.id])).rows[0].status, "CANCELADA");
        assert.equal((await pool.query("SELECT status FROM solicitacoes_consumidor WHERE venda_id=$1", [guestOrder.body.data.id])).rows[0].status, "ATENDIDA");
        assert.equal((await request("/api/public/frete/cotar", "POST", {})).status, 400);
        await pool.query("UPDATE clientes SET endereco='Rua Alterada' WHERE id=$1", [res.body.data.cliente_id]);
        assert.equal((await request("/api/public/pedidos", "POST", payload, token)).status, 409, "Cotação invalida após mudança de endereço");
        const attempts = await Promise.all([1,2].map(() => request("/api/public/pagamentos", "POST", { vendaId: order }, token)));
        assert.deepEqual(attempts.map(x => x.status).sort(), [200,201]);
        assert.equal(checkouts, 1, "Checkout não duplica com cliques simultâneos");
        const event = { id: "ORDE_TEST", reference_id: order, status: "ACTIVE", charges: [{ id: "CHAR_TEST", status: "PAID", payment_method: { type: "PIX" } }] };
        assert.equal((await request("/api/public/pagamentos/webhook", "POST", event)).status, 401);
        const signature = crypto.createHash("sha256").update(`${process.env.PAGSEGURO_TOKEN}-${JSON.stringify(event)}`).digest("hex");
        res = await request("/api/public/pagamentos/webhook", "POST", event, null, { "x-authenticity-token": signature });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal((await pool.query("SELECT status FROM vendas WHERE id=$1",[order])).rows[0].status, "PAGAMENTO_APROVADO");
        assert.equal(Number((await pool.query("SELECT quantidade FROM estoque WHERE produto_id=$1",[product])).rows[0].quantidade),8);
        const jwt = require("jsonwebtoken");
        const adminToken = jwt.sign({ id: adminId, empresaId, cargo: "ADMIN", sv: 1 }, process.env.JWT_SECRET);
        const supportList = await request("/api/atendimento", "GET", null, adminToken);
        assert.equal(supportList.status, 200);
        assert.equal(supportList.body.data[0].protocolo, supportRequest.body.data.protocolo);
        const supportItem = supportList.body.data[0];
        const supportPath = `/api/atendimento/${supportItem.id}`;
        assert.equal((await request(supportPath, "PUT", { status: "EM_ANALISE" }, token)).status, 403);
        const supportAnalysis = await request(supportPath, "PUT", { status: "EM_ANALISE" }, adminToken);
        assert.equal(supportAnalysis.status, 200, JSON.stringify(supportAnalysis.body));
        assert.equal(supportAnalysis.body.data.atendida_em, null);
        assert.equal(supportAnalysis.body.data.atendida_por, null);
        const noticeCountBeforeAnswer = (await pool.query("SELECT COUNT(*)::int AS n FROM notificacoes WHERE tipo='ATENDIMENTO'")).rows[0].n;
        const supportAnswer = { status: "ATENDIDA", resposta: "Pedido cancelado e reserva de estoque liberada." };
        const supportAnswered = await request(supportPath, "PUT", supportAnswer, adminToken);
        assert.equal(supportAnswered.status, 200, JSON.stringify(supportAnswered.body));
        assert.equal(supportAnswered.body.data.atendida_por, adminId);
        assert.ok(supportAnswered.body.data.atendida_em);
        assert.equal((await request(supportPath, "PUT", supportAnswer, adminToken)).status, 200);
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM notificacoes WHERE tipo='ATENDIMENTO'")).rows[0].n,
            noticeCountBeforeAnswer + 1, "Repetir a mesma resposta não duplica o aviso ao consumidor");
        const exported = await request("/api/public/clientes/me/dados", "GET", null, token);
        assert.equal(exported.status, 200);
        assert.equal(exported.body.consentimentos.length, 1, "Exportacao inclui o aceite LGPD");
        const privacyRequest = await request("/api/public/clientes/me/solicitacoes-lgpd", "POST",
            { tipo: "INFORMACAO", detalhes: "Informar com quem meus dados foram compartilhados." }, token);
        assert.equal(privacyRequest.status, 201, JSON.stringify(privacyRequest.body));
        const privacyList = await request("/api/lgpd", "GET", null, adminToken);
        assert.equal(privacyList.status, 200);
        const privacyItem = privacyList.body.data.find(item => item.protocolo === privacyRequest.body.data.protocolo);
        assert.ok(privacyItem, "Solicitacao LGPD aparece no painel administrativo");
        const privacyPath = `/api/lgpd/${privacyItem.id}`;
        assert.equal((await request(privacyPath, "PUT", { status: "EM_ANALISE" }, token)).status, 403);
        const privacyAnalysis = await request(privacyPath, "PUT", { status: "EM_ANALISE" }, adminToken);
        assert.equal(privacyAnalysis.status, 200, JSON.stringify(privacyAnalysis.body));
        assert.equal(privacyAnalysis.body.data.atendida_em, null);
        assert.equal(privacyAnalysis.body.data.atendida_por, null);
        const privacyAnswered = await request(privacyPath, "PUT",
            { status: "ATENDIDA", resposta: "Relacao de operadores disponibilizada ao titular." }, adminToken);
        assert.equal(privacyAnswered.status, 200, JSON.stringify(privacyAnswered.body));
        assert.equal(privacyAnswered.body.data.atendida_por, adminId);
        assert.ok(privacyAnswered.body.data.atendida_em);
        const noticesPath = "/api/dashboard/notificacoes";
        assert.equal((await request(noticesPath)).status, 401);
        assert.equal((await request(noticesPath, "GET", null, token)).status, 403);
        const notices = (await request(noticesPath, "GET", null, adminToken)).body.data;
        assert.equal(notices.filter(n => n.titulo === "Novo cliente cadastrado").length, 1, "Novo cadastro gera aviso persistente");
        assert.equal(notices.filter(n => n.titulo === "Nova solicitação LGPD").length, 1, "Solicitacao LGPD gera aviso persistente");
        assert.equal(notices.filter(n => n.titulo === "Novo pedido recebido").length, 2, "Preserva avisos de novos pedidos");
        assert.equal(notices.filter(n => n.titulo === "Nova solicitação de atendimento").length, 1, "Preserva aviso do atendimento vinculado ao pedido");
        assert.ok(notices.every(n => !n.lida));
        assert.equal((await request(noticesPath + "/lidas", "PATCH", { ids: [notices[0].id] }, adminToken)).status, 200);
        assert.equal((await request(noticesPath, "GET", null, adminToken)).body.data.filter(n => n.lida).length, 1, "Leitura persiste ao consultar novamente");
        const otherAdminId = (await pool.query("INSERT INTO usuarios(nome,email,senha_hash,perfil,empresa_id) VALUES ('Admin 2','admin2@example.invalid','test','ADMIN',$1) RETURNING id", [empresaId])).rows[0].id;
        const otherAdmin = jwt.sign({ id: otherAdminId, empresaId, cargo: "ADMIN", sv: 1 }, process.env.JWT_SECRET);
        assert.ok((await request(noticesPath, "GET", null, otherAdmin)).body.data.every(n => !n.lida), "Leitura é individual por administrador");
        const otherStore = jwt.sign({ id: adminId, empresaId: crypto.randomUUID(), cargo: "ADMIN", sv: 1 }, process.env.JWT_SECRET);
        assert.equal((await request(noticesPath, "GET", null, otherStore)).status, 401);
        assert.equal((await request(`/api/vendas/${guestOrder.body.data.id}/status`, "PATCH", { status: "SAIU_PARA_ENTREGA" }, adminToken)).status, 409, "Não envia pedido sem pagamento");
        const linkEndpoint = `/api/vendas/${order}/rastreamento`;
        assert.equal((await request(linkEndpoint)).status,401);
        assert.equal((await request(linkEndpoint,"GET",null,token)).status,403,"Cliente não tem acesso ao acompanhamento administrativo");
        assert.equal((await request(linkEndpoint,"GET",null,otherStore)).status,401,"Sessão com empresa adulterada é recusada");
        const foreignStoreId = (await pool.query("INSERT INTO empresas(nome) VALUES ('Outra loja isolada') RETURNING id")).rows[0].id;
        const foreignAdminId = (await pool.query("INSERT INTO usuarios(nome,email,senha_hash,perfil,empresa_id) VALUES ('Outra loja','foreign@example.invalid','test','ADMIN',$1) RETURNING id", [foreignStoreId])).rows[0].id;
        const foreignAdminToken = jwt.sign({ id: foreignAdminId, empresaId: foreignStoreId, cargo: "ADMIN", sv: 1 }, process.env.JWT_SECRET);
        assert.equal((await request(linkEndpoint,"GET",null,foreignAdminToken)).status,404,"Administrador autenticado de outra loja não acessa o GPS");
        assert.equal((await request("/api/vendas/invalid/rastreamento","GET",null,adminToken)).status,400);
        assert.equal((await request(`/api/vendas/${crypto.randomUUID()}/rastreamento`,"GET",null,adminToken)).status,404);
        assert.equal((await request(linkEndpoint, "POST", {}, adminToken)).status, 409, "GPS só disponível em entrega");
        assert.equal((await request(`/api/vendas/${order}/status`, "PATCH", { status: "EM_SEPARACAO" }, adminToken)).status, 200);
        const transitions = await Promise.all([1,2].map(() => request(`/api/vendas/${order}/status`, "PATCH", { status: "SAIU_PARA_ENTREGA" }, adminToken)));
        assert.ok(transitions.every(r => r.status === 200));
        assert.equal(optionalEmails.filter(e => e.html.includes("Rastrear pedido")).length, 1, "Cliques concorrentes não duplicam e-mail de entrega");
        const customerNotices = (await request("/api/public/clientes/notificacoes", "GET", null, token)).body.data;
        for (const status of ["AGUARDANDO_PAGAMENTO","PAGAMENTO_APROVADO","EM_SEPARACAO","SAIU_PARA_ENTREGA"]) {
            assert.equal(customerNotices.filter(n => n.venda_id === order && n.status_pedido === status).length, 1, `Uma notificação para ${status}`);
        }
        assert.equal((await request("/api/public/clientes/notificacoes/lidas", "PATCH", { ids: [customerNotices[0].id] }, token)).status, 200);
        assert.ok((await request("/api/public/clientes/notificacoes", "GET", null, token)).body.data.find(n => n.id === customerNotices[0].id).lida);
        const noticeCount = (await pool.query("SELECT COUNT(*)::int n FROM notificacoes")).rows[0].n;
        const waiting = await request(linkEndpoint,"GET",null,adminToken);
        assert.equal(waiting.status,200);
        assert.equal(waiting.body.data.latitude,null,"Acompanhamento aguarda GPS sem gerar link");
        assert.equal(waiting.headers.get("cache-control"),"no-store");
        const link = await request(linkEndpoint, "POST", {}, adminToken);
        assert.equal(link.status, 200, JSON.stringify(link.body));
        const driverToken = new URL(link.body.data.url).hash.slice(1);
        assert.equal((await request(linkEndpoint,"GET",null,driverToken)).status,401,"Link do entregador não é sessão administrativa");
        const position = { latitude: -23.66, longitude: -46.55, precisao: 10 };
        const gps = "/api/public/entregas/localizacao";
        assert.equal((await request("/api/public/entregas/viagem")).status, 401);
        const trip = await request("/api/public/entregas/viagem", "GET", null, driverToken);
        assert.equal(trip.body.data.endereco_entrega.endereco, "Rua de Teste");
        assert.equal(trip.body.data.token_hash, undefined);
        const config = await request("/api/public/entregas/mapa-config");
        assert.deepEqual(config.body.data, { browserKey: "test-public-browser-key" }, "Não expõe chave privada de Routes");
        assert.equal((await request("/api/public/entregas/rota", "POST", {}, driverToken)).status, 409, "Navegação exige posição real do entregador");
        const previewTracking = (await request(`/api/public/pedidos/${order}/rastreamento`, "GET", null, token)).body.data;
        assert.equal(previewTracking.latitude, null, "Não simula posição do entregador na loja");
        assert.equal(previewTracking.rota, null);
        assert.equal((await request(gps, "POST", position)).status, 401);
        assert.equal((await request(gps, "POST", { ...position, latitude: 91 }, driverToken)).status, 400);
        assert.equal((await request(gps, "POST", position, driverToken)).status, 200);
        assert.equal((await request("/api/public/entregas/rota", "POST", {}, driverToken)).status, 200);
        assert.equal((await request("/api/public/entregas/rota", "POST", {}, driverToken)).status, 200);
        assert.equal((await request(`/api/public/pedidos/${order}/rastreamento`, "GET", null, token)).body.data.rota.tipoOrigem, "GPS_ENTREGADOR");
        assert.equal(routeCalls, 1, "Consultas repetidas reaproveitam rota e limitam custo");
        const tracking = `/api/public/pedidos/${order}/rastreamento`;
        assert.equal((await request(tracking)).status, 401);
        const otherToken = jwt.sign({ id: crypto.randomUUID(), empresaId, type: "customer", sv: 1 }, process.env.JWT_SECRET);
        assert.equal((await request(tracking, "GET", null, otherToken)).status, 401);
        assert.equal((await request(tracking, "GET", null, token)).body.data.latitude, position.latitude);
        assert.equal((await request(tracking, "GET", null, token)).body.data.rota.polyline, "test-route", "Cliente recebe a mesma rota do entregador");
        const adminTracking = await request(linkEndpoint,"GET",null,adminToken);
        assert.equal(adminTracking.status,200);
        assert.deepEqual(adminTracking.body.data,(await request(tracking,"GET",null,token)).body.data,"Administrador e cliente veem o mesmo GPS e rota");
        assert.equal(adminTracking.body.data.token_hash,undefined);
        assert.equal(adminTracking.body.data.token,undefined);
        const managerId = (await pool.query("INSERT INTO usuarios(nome,email,senha_hash,perfil,empresa_id) VALUES ('Gerente','gerente@example.invalid','test','GERENTE',$1) RETURNING id", [empresaId])).rows[0].id;
        const managerToken = jwt.sign({id:managerId,empresaId,cargo:"GERENTE",sv:1},process.env.JWT_SECRET);
        assert.equal((await request(linkEndpoint,"GET",null,managerToken)).status,200);
        assert.equal((await request(gps,"POST",position,driverToken)).status,200,"Consultar no painel não revoga o link do entregador");
        await pool.query("UPDATE entrega_rastreamento SET expira_em=NOW()-INTERVAL '1 minute' WHERE venda_id=$1",[order]);
        const expiredTracking = await request(linkEndpoint,"GET",null,adminToken);
        assert.equal(expiredTracking.body.data.latitude,null,"GPS expirado não aparece no painel");
        assert.equal(expiredTracking.body.data.rota,null);
        assert.equal((await request("/api/public/clientes/notificacoes", "GET", null, otherToken)).status, 401, "Token de cliente inexistente é recusado");
        const replacement = await request(linkEndpoint, "POST", {}, adminToken);
        const replacementToken = new URL(replacement.body.data.url).hash.slice(1);
        assert.equal((await request("/api/public/entregas/viagem", "GET", null, driverToken)).status, 410);
        assert.equal((await request("/api/public/entregas/rota", "POST", {}, driverToken)).status, 410);
        assert.equal((await request(tracking, "GET", null, token)).body.data.rota, null, "Novo link remove rota da viagem anterior");
        assert.equal((await request(gps, "POST", position, driverToken)).status, 410, "Rotação revoga token anterior");
        assert.equal((await request(gps, "POST", position, replacementToken)).status, 200);
        assert.equal((await request(gps, "DELETE", null, replacementToken)).status, 200);
        assert.equal((await request(tracking, "GET", null, token)).body.data.latitude, null);
        assert.equal((await request(gps, "POST", position, replacementToken)).status, 410, "Parar revoga link");
        const lastLink = await request(linkEndpoint, "POST", {}, adminToken);
        const lastDriverToken = new URL(lastLink.body.data.url).hash.slice(1);
        await request(gps, "POST", position, lastDriverToken);
        assert.equal((await request(`/api/vendas/${order}/status`, "PATCH", { status: "ENTREGUE" }, adminToken)).status, 200);
        assert.equal((await request(`/api/vendas/${order}/status`, "PATCH", { status: "SAIU_PARA_ENTREGA" }, adminToken)).status, 409);
        assert.equal((await request(gps, "POST", position, lastDriverToken)).status, 410);
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM entrega_rastreamento WHERE venda_id=$1", [order])).rows[0].n, 0, "Entrega encerra rastreamento e apaga GPS");
        const deliveredTracking = await request(linkEndpoint,"GET",null,adminToken);
        assert.equal(deliveredTracking.status,200);
        assert.equal(deliveredTracking.body.data.status,"ENTREGUE");
        assert.equal(deliveredTracking.body.data.latitude,null);
        assert.equal(deliveredTracking.body.data.rota,null);
        assert.equal((await request("/api/public/pagamentos/webhook", "POST", event, null, { "x-authenticity-token": signature })).status,200);
        assert.equal((await pool.query("SELECT status FROM vendas WHERE id=$1",[order])).rows[0].status,"ENTREGUE");
        assert.equal(Number((await pool.query("SELECT quantidade FROM estoque WHERE produto_id=$1",[product])).rows[0].quantidade),8);
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM financeiro WHERE referencia_id=$1",[order])).rows[0].n,1);
        // O migrador atual reaplica os SQL: o frete deve sobreviver a um segundo deploy.
        for (const file of fs.readdirSync("database/sql").filter(f => f.endsWith(".sql")).sort()) {
            await pool.query(fs.readFileSync(`database/sql/${file}`, "utf8"));
        }
        assert.equal(Number((await pool.query("SELECT valor_final FROM vendas WHERE id=$1", [order])).rows[0].valor_final), 28.5);
        assert.equal((await pool.query("SELECT COUNT(*)::int n FROM notificacoes")).rows[0].n, noticeCount + 1, "Segundo deploy não duplica avisos; somente Entregue acrescenta um");
        const pagbank = require("../services/pagseguroService");
        assert.equal(pagbank.mapStatusToVenda("AUTHORIZED"), "AGUARDANDO_PAGAMENTO");
        assert.equal(pagbank.mapStatusToVenda("EXPIRED"), "CANCELADA");
        const stock = require("../services/movimentacaoEstoqueService");
        const results = await Promise.allSettled([stock.saida(empresaId, product, 5), stock.saida(empresaId, product, 5)]);
        assert.equal(results.filter(x => x.status === "fulfilled").length,1);
        assert.equal(Number((await pool.query("SELECT quantidade FROM estoque WHERE produto_id=$1",[product])).rows[0].quantidade),3);
        const saleService = require("../services/vendaService");
        const customerId = (await pool.query("SELECT id FROM clientes WHERE email=$1", [customer.email])).rows[0].id;
        const refundable = await saleService.finalizarVenda(empresaId,
            { cliente_id: customerId, formaPagamento: "PAGBANK" }, [{ produtoId: product, quantidade: 1 }]);
        await saleService.confirmarPagamento(empresaId, refundable.venda.id,
            { pagseguroStatus: "PAID", pagseguroChargeId: "CHAR_CANCEL_TEST" });
        const originalRefund = pagbank.cancelarCobranca;
        let refundCalls = 0;
        try {
            pagbank.cancelarCobranca = async () => { throw Object.assign(new Error("Estorno indisponível"), { status: 503 }); };
            await assert.rejects(saleService.cancelarPedido(empresaId, refundable.venda.id), { status: 503 });
            assert.equal((await pool.query("SELECT status FROM vendas WHERE id=$1", [refundable.venda.id])).rows[0].status,
                "PAGAMENTO_APROVADO", "Falha no estorno mantém pedido pago para nova tentativa");
            assert.equal(Number((await pool.query("SELECT quantidade FROM estoque WHERE produto_id=$1", [product])).rows[0].quantidade), 2);
            pagbank.cancelarCobranca = async (charge, total) => {
                assert.equal(charge, "CHAR_CANCEL_TEST");
                assert.equal(Number(total), 12.5);
                refundCalls++;
                return { id: charge, status: "CANCELED" };
            };
            const cancellations = await Promise.all([1, 2].map(() => saleService.cancelarPedido(empresaId, refundable.venda.id)));
            assert.ok(cancellations.every(item => item.status === "CANCELADA"));
            assert.equal(refundCalls, 1, "Cancelamentos simultâneos não repetem o estorno");
            assert.equal(Number((await pool.query("SELECT quantidade FROM estoque WHERE produto_id=$1", [product])).rows[0].quantidade), 3,
                "Cancelamentos simultâneos devolvem o estoque uma única vez");
            assert.equal((await pool.query("SELECT reembolso_status FROM vendas WHERE id=$1", [refundable.venda.id])).rows[0].reembolso_status,
                "PROCESSADO");
        } finally {
            pagbank.cancelarCobranca = originalRefund;
        }
        console.log("Fluxo completo aprovado com PostgreSQL real e provedores simulados.");
    } finally {
        global.fetch = originalFetch;
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        if (pool) await pool.end();
        if (/^test_backend_[a-f0-9]{16}$/.test(schema)) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
    }
});
