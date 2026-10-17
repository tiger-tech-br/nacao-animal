"use strict";

const db = require("../database/connection");

async function produtos(request, response, next) {
    try {
        const { rows } = await db.query(`
            SELECT
                p.id,
                p.nome,
                p.descricao,
                p.preco,
                p.foto,
                p.sku,
                COALESCE(e.quantidade,0)::int AS estoque_disponivel,
                c.nome AS categoria
            FROM produtos p
            LEFT JOIN estoque e ON e.produto_id=p.id AND e.empresa_id=p.empresa_id
            LEFT JOIN categorias c
                ON c.id = p.categoria_id
            WHERE COALESCE(p.status, p.ativo, TRUE) = TRUE
              AND p.empresa_id = get_petflow_empresa_id()
            ORDER BY p.nome ASC;
        `);

        return response.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        next(error);
    }
}

async function categorias(request, response, next) {
    try {
        const { rows } = await db.query(`
            SELECT
                id,
                nome,
                descricao
            FROM categorias
            WHERE COALESCE(status, ativo, TRUE) = TRUE
              AND empresa_id = get_petflow_empresa_id()
            ORDER BY nome ASC;
        `);

        return response.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        next(error);
    }
}

async function loja(request, response, next) {
    try {
        const { rows } = await db.query(`
            SELECT nome,logo,razao_social,cnpj,telefone,email,endereco,numero,complemento,
                   bairro,cidade,estado,cep,horario_abertura,horario_fechamento
            FROM empresas WHERE id=get_petflow_empresa_id() LIMIT 1
        `);
        if (!rows[0]) return response.status(404).json({ success: false, message: "Loja não encontrada." });
        return response.json({ success: true, data: rows[0] });
    } catch (error) { next(error); }
}


module.exports = {
    produtos,
    categorias,
    loja
};
