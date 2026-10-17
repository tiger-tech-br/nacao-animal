"use strict";

const fail = message => Object.assign(new Error(message), { status: 400 });
const cents = value => Math.round(Number(value) * 100);

function normalizarCodigo(value) {
    if (typeof value !== "string" || !/^[A-Z0-9_-]{3,40}$/.test(value.trim().toUpperCase())) {
        throw fail("Informe um código de cupom válido, com 3 a 40 caracteres.");
    }
    return value.trim().toUpperCase();
}

function calcularDesconto(cupom, subtotalCentavos, now = new Date()) {
    if (!cupom || !cupom.ativo) throw fail("Cupom inválido ou indisponível.");
    if (new Date(cupom.inicia_em) > now) throw fail("Este cupom ainda não está disponível.");
    if (cupom.expira_em && new Date(cupom.expira_em) <= now) throw fail("Este cupom expirou.");
    if (!Number.isSafeInteger(subtotalCentavos) || subtotalCentavos <= 0) throw fail("Adicione produtos para usar um cupom.");
    if (subtotalCentavos < cents(cupom.minimo_compra)) {
        throw fail(`Este cupom exige R$ ${Number(cupom.minimo_compra).toFixed(2).replace(".", ",")} em produtos.`);
    }
    let discount = cupom.tipo === "PERCENTUAL"
        ? Math.round(subtotalCentavos * Number(cupom.valor) / 100)
        : cents(cupom.valor);
    if (cupom.desconto_maximo != null) discount = Math.min(discount, cents(cupom.desconto_maximo));
    discount = Math.min(discount, subtotalCentavos);
    if (!Number.isSafeInteger(discount) || discount <= 0) throw fail("Este cupom não gera desconto para esta sacola.");
    return discount;
}

async function validar(client, empresaId, codigo, subtotalCentavos, lock = false, clienteId = null) {
    const { rows } = await client.query(
        `SELECT * FROM cupons WHERE empresa_id=$1 AND codigo=$2 ${lock ? "FOR SHARE" : ""}`,
        [empresaId, normalizarCodigo(codigo)]
    );
    const cupom = rows[0];
    if (cupom && (cupom.limite_usos || (clienteId && cupom.limite_por_cliente))) {
        const { rows: [usage] } = await client.query(
            `SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE cliente_id=$3)::int AS cliente
             FROM vendas WHERE empresa_id=$1 AND cupom_codigo=$2 AND status <> 'CANCELADA'`,
            [empresaId, cupom.codigo, clienteId]
        );
        if (cupom.limite_usos && usage.total >= cupom.limite_usos) throw fail("Este cupom atingiu o limite de utilizações.");
        if (clienteId && cupom.limite_por_cliente && usage.cliente >= cupom.limite_por_cliente) {
            throw fail("Você já utilizou este cupom o número máximo de vezes.");
        }
    }
    const desconto = calcularDesconto(cupom, subtotalCentavos) / 100;
    return { codigo: cupom.codigo, descricao: cupom.descricao, desconto };
}

// A prévia usa os mesmos preços do banco usados para criar o pedido.
async function subtotalSacola(client, empresaId, itens) {
    if (!Array.isArray(itens) || !itens.length || itens.length > 100) throw fail("Sacola inválida.");
    const quantidades = new Map();
    for (const item of itens) {
        const id = item?.produto_id;
        const quantity = Number(item?.quantidade);
        if (typeof id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
            !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) throw fail("Produto ou quantidade inválidos.");
        const key = id.toLowerCase();
        quantidades.set(key, (quantidades.get(key) || 0) + quantity);
        if (quantidades.get(key) > 999) throw fail("Quantidade máxima por produto: 999.");
    }
    const { rows } = await client.query(
        "SELECT id, preco FROM produtos WHERE empresa_id=$1 AND ativo=TRUE AND id=ANY($2::uuid[])",
        [empresaId, [...quantidades.keys()]]
    );
    if (rows.length !== quantidades.size) throw fail("Há produtos indisponíveis na sacola. Atualize a página.");
    const total = rows.reduce((sum, item) => sum + cents(item.preco) * quantidades.get(item.id), 0);
    if (!Number.isSafeInteger(total) || total <= 0) throw fail("Sacola inválida.");
    return total;
}

async function disponiveis(client, empresaId, subtotalCentavos) {
    const { rows } = await client.query(
        `SELECT * FROM cupons WHERE empresa_id=$1 AND ativo=TRUE AND publico=TRUE
         AND inicia_em<=NOW() AND (expira_em IS NULL OR expira_em>NOW()) ORDER BY codigo`, [empresaId]
    );
    return rows.flatMap(cupom => {
        try {
            return [{ codigo: cupom.codigo, descricao: cupom.descricao,
                desconto: calcularDesconto(cupom, subtotalCentavos) / 100,
                minimoCompra: Number(cupom.minimo_compra), expiraEm: cupom.expira_em }];
        } catch { return []; }
    });
}

module.exports = { validar, disponiveis, subtotalSacola, calcularDesconto, normalizarCodigo };
