"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("cancelamento revalida pagamento sob bloqueio antes de decidir o estorno", async () => {
    const saved = new Map();
    const paidSale = {
        id: "sale-test", empresa_id: "store-test", status: "PAGAMENTO_APROVADO",
        pagseguro_charge_id: "CHAR_TEST", valor_final: 28.5, estoque_baixado_em: null
    };
    let locked = false;
    let refunds = 0;
    const client = {
        query: async (sql, params) => {
            if (sql.includes("SELECT * FROM vendas")) {
                locked = true;
                return { rows: [{ ...paidSale }] };
            }
            if (sql.includes("UPDATE vendas SET status='CANCELADA'")) {
                assert.equal(refunds, 1, "Pedido pago recebe estorno antes do cancelamento local");
                return { rows: [{ ...paidSale, status: "CANCELADA", reembolso_status: params[2] }] };
            }
            return { rows: [] };
        }
    };
    function stub(path, exports) {
        const id = require.resolve(path);
        saved.set(id, require.cache[id]);
        require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    const serviceId = require.resolve("../services/vendaService");
    saved.set(serviceId, require.cache[serviceId]);
    delete require.cache[serviceId];
    try {
        stub("../database/connection", { transaction: callback => callback(client) });
        // Simula o pagamento confirmado entre a leitura inicial e o FOR UPDATE.
        stub("../models/vendaModel", {
            buscarPorId: async () => ({ ...paidSale, status: "AGUARDANDO_PAGAMENTO", pagseguro_charge_id: null })
        });
        stub("../models/itemVendaModel", {});
        stub("../services/movimentacaoEstoqueService", {});
        stub("../services/financeiroService", { cancelarPorReferencia: async () => {} });
        stub("../services/cupomService", {});
        stub("../services/pagseguroService", {
            cancelarCobranca: async (chargeId, total, key) => {
                assert.equal(locked, true, "Estado do pedido permanece bloqueado durante o estorno");
                assert.equal(chargeId, "CHAR_TEST");
                assert.equal(total, 28.5);
                assert.equal(key, "cancel-sale-test");
                refunds++;
                return { id: chargeId };
            }
        });
        stub("../services/auditService", { registrar: async () => {} });
        stub("../services/emailService", { orderCanceledTemplate: () => ({}) });
        const service = require("../services/vendaService");
        const result = await service.cancelarPedido("store-test", "sale-test");
        assert.equal(result.status, "CANCELADA");
        assert.equal(result.reembolso_status, "PROCESSADO");
        assert.equal(refunds, 1);
    } finally {
        for (const [id, cached] of saved) {
            if (cached) require.cache[id] = cached;
            else delete require.cache[id];
        }
    }
});
