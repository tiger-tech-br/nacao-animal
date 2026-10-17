"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { avaliarCancelamento, haversineMeters } = require("../services/cancelamentoEntregaService");

test("cancelamento automático é permitido antes de o pedido sair da loja", () => {
    for (const status of ["AGUARDANDO_PAGAMENTO", "PAGAMENTO_APROVADO", "EM_SEPARACAO"]) {
        assert.equal(avaliarCancelamento({ status, data_venda: new Date().toISOString() }).permitido, true);
    }
});

test("GPS recente permite cancelar quando o entregador ainda está longe do destino", () => {
    const result = avaliarCancelamento({ status: "SAIU_PARA_ENTREGA", data_venda: new Date().toISOString(),
        latitude: -23.65, longitude: -46.55, precisao_m: 10, atualizado_em: new Date().toISOString(),
        rota: { destino: { latitude: -23.67, longitude: -46.56 } } });
    assert.ok(result.distanciaMetros > 1000);
    assert.equal(result.permitido, true);
    assert.equal(result.etapa, "EM_ROTA_LONGE");
});

test("cancelamento automático é bloqueado perto do destino ou sem GPS confiável", () => {
    const near = avaliarCancelamento({ status: "SAIU_PARA_ENTREGA", data_venda: new Date().toISOString(),
        latitude: -23.6702, longitude: -46.5602, precisao_m: 8, atualizado_em: new Date().toISOString(),
        rota: { destino: { latitude: -23.67, longitude: -46.56 } } });
    assert.equal(near.permitido, false);
    assert.equal(near.etapa, "PROXIMO_DESTINO");
    const stale = avaliarCancelamento({ status: "SAIU_PARA_ENTREGA", data_venda: new Date().toISOString(),
        latitude: -23.65, longitude: -46.55, precisao_m: 10,
        atualizado_em: new Date(Date.now() - 60000).toISOString(),
        rota: { destino: { latitude: -23.67, longitude: -46.56 } } });
    assert.equal(stale.permitido, false);
    assert.equal(stale.etapa, "GPS_INDISPONIVEL");
});

test("distância é calculada entre as coordenadas reais", () => {
    const meters = haversineMeters({ latitude: -23.65, longitude: -46.55 }, { latitude: -23.65, longitude: -46.54 });
    assert.ok(meters > 900 && meters < 1200);
});

test("cancelamento e estorno automáticos terminam 24 horas após a compra", () => {
    const now = Date.now();
    const result = avaliarCancelamento({
        status: "EM_SEPARACAO",
        data_venda: new Date(now - (24 * 60 * 60 * 1000) - 1).toISOString()
    }, now);

    assert.equal(result.permitido, false);
    assert.equal(result.etapa, "PRAZO_EXPIRADO");
});
