"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
require.cache[require.resolve("../config/env")] = { exports: { APP_URL:"https://petflow.example", PAGSEGURO_BASE_URL:"https://sandbox.api.pagseguro.com", PAGSEGURO_TOKEN:"test", JWT_SECRET:"test" } };
let sent, sentUrl, sentConfig;
require("axios").create = () => ({ post:async (url,body,config)=>{sentUrl=url;sent=body;sentConfig=config;return {data:{id:"CHEC_TEST",reference_id:"local-order",links:[{rel:"PAY",href:"https://example.invalid/pay"}]}};} });
const service = require("../services/pagseguroService");
const VendaService = require("../services/vendaService");
test("checkout envia preço, frete, desconto e acréscimo em centavos e preserva endereço", async () => {
    const result = await service.criarCheckout({id:"local-order",acrescimo:2,desconto:1.5,valor_frete:3,
        cliente:{nome:"Cliente Teste",endereco:"Endereço novo"},endereco_entrega:{endereco:"Endereço do pedido",numero:"10",cep:"09000000",cidade:"Santo André",estado:"SP",bairro:"Centro"},
        itens:[{produto_id:"product",produto:"Produto",quantidade:2,preco_unitario:29.9}]
    });
    assert.equal(sent.items[0].unit_amount,2990);
    assert.equal(sent.additional_amount,200);
    assert.equal(sent.discount_amount,150);
    assert.equal(sent.shipping.amount,300);
    assert.equal(sent.shipping.address.street,"Endereço do pedido");
    assert.equal(sent.shipping.address_modifiable,false);
    assert.equal(sent.payment_notification_urls[0],"https://petflow.example/api/public/pagamentos/webhook");
    assert.equal(result.orderId,null,"Referência local não é identificador ORDE do PagBank");
    await service.criarCheckout({id:"free",cliente:{},itens:[{preco_unitario:1,quantidade:1}],valor_frete:0});
    assert.equal(sent.shipping.type,"FREE");
});
test("webhooks distinguem identificador de checkout e identificador do pagamento", () => {
    assert.equal(service.extrairEventoWebhook({id:"CHEC_TEST",reference_id:"order",status:"EXPIRED"}).orderId,null);
    assert.equal(service.extrairEventoWebhook({id:"ORDE_TEST",reference_id:"order",charges:[{status:"PAID"}]}).orderId,"ORDE_TEST");
    assert.equal(service.mapStatusToVenda("AUTHORIZED"),"AGUARDANDO_PAGAMENTO");
});
test("checkout expira junto com a reserva e estorno usa o contrato oficial da cobranca", async () => {
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await service.criarCheckout({ id:"reserved", reserva_expira_em:expires, cliente:{},
        itens:[{preco_unitario:10,quantidade:1}], valor_frete:0 });
    assert.equal(sent.expiration_date, expires);

    await service.cancelarCobranca("CHAR_TEST", 12.34, "cancel-order");
    assert.equal(sentUrl, "/charges/CHAR_TEST/cancel");
    assert.deepEqual(sent, { amount: { value: 1234 } });
    assert.equal(sentConfig.headers["x-idempotency-key"], "cancel-order");
});
test("expiração de checkout não cancela pedido pago nem em entrega; cancelamento transacional permanece", async () => {
    require.cache[require.resolve("../database/connection")] = { exports:{} };
    const model = require("../models/vendaModel");
    for (const [current,id,expected] of [["ENTREGUE","CHEC_TEST","ENTREGUE"],["SAIU_PARA_ENTREGA","CHEC_TEST","SAIU_PARA_ENTREGA"],["AGUARDANDO_PAGAMENTO","CHEC_TEST","CANCELADA"],["PAGAMENTO_APROVADO","ORDE_TEST","CANCELADA"]]) {
        let values;
        const client = {query:async(sql,args)=> {
            if(sql.includes("SELECT *"))return {rows:[{id:"order",status:current}]};
            values=args;return {rows:[{id:"order",status:args[0]}]};
        }};
        await model.atualizarPagamentoPorReferencia("order",{status:"CANCELADA",pagseguroStatus:"EXPIRED",pagseguroResponse:{id}},client);
        assert.equal(values[0],expected);
    }
});

test("painel administrativo não pode aprovar pagamento sem confirmação do PagBank", async () => {
    await assert.rejects(
        VendaService.atualizarStatusPedido(
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
            "PAGAMENTO_APROVADO"
        ),
        error => error?.status === 409 && /PagBank/.test(error.message)
    );
});
