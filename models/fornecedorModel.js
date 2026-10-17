"use strict";

const db = require("../database/connection");

async function listar(empresaId) {
    const query = `
        SELECT *
        FROM fornecedores
        WHERE ativo = TRUE
          AND empresa_id = $1
        ORDER BY nome ASC
    `;

    const { rows } = await db.query(query, [empresaId]);

    return rows;
}

async function buscarPorId(id, empresaId) {
    const query = `
        SELECT *
        FROM fornecedores
        WHERE id = $1
        AND empresa_id = $2
        LIMIT 1
    `;

    const { rows } = await db.query(query, [id, empresaId]);

    return rows[0];
}

async function criar(dados) {
    const query = `
        INSERT INTO fornecedores (
            empresa_id,
            nome,
            razao_social,
            nome_fantasia,
            cnpj,
            telefone,
            email,
            endereco
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `;

    const valores = [
        dados.empresa_id,
        dados.nome,
        dados.razao_social || dados.nome,
        dados.nome_fantasia || dados.nome,
        dados.cnpj,
        dados.telefone,
        dados.email,
        dados.endereco
    ];

    const { rows } = await db.query(query, valores);

    return rows[0];
}

async function atualizar(id, empresaId, dados) {
    const query = `
        UPDATE fornecedores
        SET
            nome = $1,
            razao_social = $2,
            nome_fantasia = $3,
            cnpj = $4,
            telefone = $5,
            email = $6,
            endereco = $7,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        AND empresa_id = $9
        RETURNING *
    `;

    const valores = [
        dados.nome,
        dados.razao_social || dados.nome,
        dados.nome_fantasia || dados.nome,
        dados.cnpj,
        dados.telefone,
        dados.email,
        dados.endereco,
        id,
        empresaId
    ];

    const { rows } = await db.query(query, valores);

    return rows[0];
}

async function excluir(id, empresaId) {
    const compras = await db.query(
        `
            SELECT id
            FROM compras
            WHERE fornecedor_id = $1
            AND empresa_id = $2
            LIMIT 1
        `,
        [id, empresaId]
    );

    if (compras.rows[0]) {
        const { rows } = await db.query(
            `
                UPDATE fornecedores
                SET
                    ativo = FALSE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                AND empresa_id = $2
                RETURNING *
            `,
            [id, empresaId]
        );

        return rows[0];
    }

    const query = `
        DELETE FROM fornecedores
        WHERE id = $1
        AND empresa_id = $2
        RETURNING *
    `;

    const { rows } = await db.query(query, [id, empresaId]);

    return rows[0];
}

module.exports = {
    listar,
    buscarPorId,
    criar,
    atualizar,
    excluir
};
