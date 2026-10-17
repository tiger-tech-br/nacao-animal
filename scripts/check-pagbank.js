"use strict";
require("dotenv").config({ quiet: true });
const crypto = require("node:crypto");

async function main() {
    if (!process.argv.includes("--create")) throw new Error("Use --create para criar um checkout de diagnóstico sem efetuar pagamento.");
    const base = process.env.PAGSEGURO_BASE_URL?.trim().replace(/\/+$/, "");
    if (!["https://api.pagseguro.com", "https://sandbox.api.pagseguro.com"].includes(base)) throw new Error("URL PagBank inválida.");
    const key = process.env.PAGSEGURO_TOKEN?.trim();
    if (!key) throw new Error("Token PagBank ausente.");
    const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    // Sem dados de cliente, sem email e sem chamada de cobrança/captura.
    const response = await fetch(`${base}/checkouts`, { method: "POST", headers, signal: AbortSignal.timeout(30000), body: JSON.stringify({
        reference_id: `diagnostico-${crypto.randomUUID()}`,
        expiration_date: new Date(Date.now()+15*60000).toISOString(),
        customer_modifiable: true,
        items: [{ reference_id: "MOR-DENTAL-01", name: "Diagnóstico PetFlow - não pagar", quantity: 1, unit_amount: 2990 }],
        shipping: { type: "FIXED", amount: 300, address_modifiable: true },
        payment_methods: [{type:"PIX"},{type:"CREDIT_CARD"},{type:"DEBIT_CARD"}]
    }) });
    const data = await response.json();
    if (!response.ok) {
        console.log(JSON.stringify({ etapa:"criar", http:response.status, erros:data.error_messages?.map(x=>({code:x.code,description:x.description})) }));
        process.exitCode=1; return;
    }
    const check = await fetch(`${base}/checkouts/${encodeURIComponent(data.id)}`, { headers, signal:AbortSignal.timeout(15000) });
    const verified = await check.json();
    console.log(JSON.stringify({ etapa:"criado_e_consultado", ambiente:base.includes("sandbox")?"sandbox":"produção", criacaoHTTP:response.status, consultaHTTP:check.status, id:data.id, status:verified.status, temLinkPagamento:!!verified.links?.find(x=>x.rel==="PAY"), freteCentavos:verified.shipping?.amount, expiraEm:verified.expiration_date, pagamentoEfetuado:false }));
    if (!check.ok) process.exitCode=1;
}
main().catch(error=>{ console.error("Diagnóstico falhou:",error.cause?.code||error.code||error.name);process.exitCode=1; });
