"use strict";

const db = require("../database/connection");

const MovimentacaoEstoqueService = {

    /* ==============================================
       ENTRADA DE ESTOQUE
    ============================================== */

    async entrada(empresaId, produtoId, quantidade, client = db, metadata = {}) {

        quantidade = Number(quantidade);

        if (quantidade <= 0) {

            throw new Error("Quantidade inválida.");

        }

        const estoque = await this.consultar(

            empresaId,
            produtoId,
            client

        );

        if (!estoque) {

            const query = `
                INSERT INTO estoque (

                    empresa_id,
                    produto_id,
                    quantidade,
                    created_at,
                    updated_at

                )

                VALUES (

                    $1,
                    $2,
                    $3,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP

                )

                RETURNING *;
            `;

            const { rows } = await client.query(query, [

                empresaId,
                produtoId,
                quantidade

            ]);

            await registrarMovimentacao(client, empresaId, produtoId, "ENTRADA", quantidade, 0, rows[0].quantidade, metadata);
            return rows[0];

        }

        const query = `
            UPDATE estoque
            SET

                quantidade = quantidade + $1,
                updated_at = CURRENT_TIMESTAMP

            WHERE empresa_id = $2
            AND produto_id = $3

            RETURNING *;
        `;

        const { rows } = await client.query(query, [

            quantidade,
            empresaId,
            produtoId

        ]);

        await registrarMovimentacao(client, empresaId, produtoId, metadata.tipo || "ENTRADA", quantidade,
            Number(rows[0].quantidade) - quantidade, rows[0].quantidade, metadata);
        return rows[0];

    },

    /* ==============================================
       SAÍDA DE ESTOQUE
    ============================================== */

    async saida(empresaId, produtoId, quantidade, client = db, metadata = {}) {
        quantidade = Number(quantidade);
        if (!Number.isInteger(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");
        const { rows } = await client.query(`
            UPDATE estoque SET quantidade = quantidade - $1, updated_at = CURRENT_TIMESTAMP
            WHERE empresa_id = $2 AND produto_id = $3 AND quantidade >= $1
            RETURNING *
        `, [quantidade, empresaId, produtoId]);
        if (!rows[0]) {
            const error = new Error("Estoque insuficiente para concluir o pedido.");
            error.status = 409;
            throw error;
        }
        await registrarMovimentacao(client, empresaId, produtoId, metadata.tipo || "SAIDA", quantidade,
            Number(rows[0].quantidade) + quantidade, rows[0].quantidade, metadata);
        return rows[0];
    },

    /* ==============================================
       AJUSTE MANUAL
    ============================================== */

    async ajustar(empresaId, produtoId, quantidade, client = db, metadata = {}) {

        quantidade = Number(quantidade);

        if (quantidade < 0) {

            throw new Error("Quantidade inválida.");

        }

        const anterior = await this.consultar(empresaId, produtoId, client);
        const query = `
            UPDATE estoque
            SET

                quantidade = $1,
                updated_at = CURRENT_TIMESTAMP

            WHERE empresa_id = $2
            AND produto_id = $3

            RETURNING *;
        `;

        const { rows } = await client.query(query, [

            quantidade,
            empresaId,
            produtoId

        ]);

        if (rows[0] && Number(anterior?.quantidade) !== Number(rows[0].quantidade)) {
            await registrarMovimentacao(client, empresaId, produtoId, "AJUSTE",
                Math.abs(Number(rows[0].quantidade) - Number(anterior?.quantidade || 0)),
                anterior?.quantidade || 0, rows[0].quantidade, metadata);
        }
        return rows[0];

    },

    /* ==============================================
       CONSULTAR ESTOQUE
    ============================================== */

    async consultar(empresaId, produtoId, client = db) {

        const query = `
            SELECT *

            FROM estoque

            WHERE empresa_id = $1
            AND produto_id = $2

            LIMIT 1;
        `;

        const { rows } = await client.query(query, [

            empresaId,
            produtoId

        ]);

        return rows[0];

    },

    /* ==============================================
       VERIFICAR DISPONIBILIDADE
    ============================================== */

    async verificarDisponibilidade(empresaId, produtoId, quantidade, client = db) {

        quantidade = Number(quantidade);

        const estoque = await this.consultar(

            empresaId,
            produtoId,
            client

        );

        if (!estoque) {

            return false;

        }

        return Number(estoque.quantidade) >= quantidade;

    }

};

async function registrarMovimentacao(client, empresaId, produtoId, tipo, quantidade, saldoAnterior, saldoNovo, metadata) {
    await client.query(
        `INSERT INTO movimentacoes_estoque
         (empresa_id,produto_id,tipo,quantidade,observacao,usuario_id,
          referencia_tipo,referencia_id,saldo_anterior,saldo_novo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [empresaId, produtoId, tipo, quantidade, metadata.observacao || null,
            metadata.usuarioId || null, metadata.referenciaTipo || null,
            metadata.referenciaId || null, saldoAnterior, saldoNovo]
    );
}

module.exports = MovimentacaoEstoqueService;
