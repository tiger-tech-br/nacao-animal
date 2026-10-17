"use strict";

const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const { buildDbOptions } = require("../config/dbOptions");

require("dotenv").config();

const pool = new Pool(buildDbOptions());

const DEFAULT_PASSWORD = "Demo@1234";

const demoCustomers = [
    {
        nome: "Marina Costa",
        cpf: "111.222.333-44",
        data_nascimento: "1991-04-18",
        telefone: "(11) 90000-0101",
        email: "marina.costa.demo@petflow.local",
        cep: "09060-070",
        endereco: "Rua Brasilio Machado",
        numero: "410",
        complemento: "Apto 21",
        bairro: "Vila Principe de Gales",
        cidade: "Santo Andre",
        estado: "SP"
    },
    {
        nome: "Rafael Almeida",
        cpf: "222.333.444-55",
        data_nascimento: "1987-09-03",
        telefone: "(11) 90000-0102",
        email: "rafael.almeida.demo@petflow.local",
        cep: "01310-100",
        endereco: "Avenida Paulista",
        numero: "900",
        complemento: "Bloco B",
        bairro: "Bela Vista",
        cidade: "Sao Paulo",
        estado: "SP"
    },
    {
        nome: "Camila Rocha",
        cpf: "333.444.555-66",
        data_nascimento: "1994-12-09",
        telefone: "(11) 90000-0103",
        email: "camila.rocha.demo@petflow.local",
        cep: "04094-050",
        endereco: "Rua dos Ipes",
        numero: "125",
        complemento: "Casa",
        bairro: "Vila Mariana",
        cidade: "Sao Paulo",
        estado: "SP"
    },
    {
        nome: "Bruno Martins",
        cpf: "444.555.666-77",
        data_nascimento: "1989-06-27",
        telefone: "(11) 90000-0104",
        email: "bruno.martins.demo@petflow.local",
        cep: "09530-250",
        endereco: "Rua Amazonas",
        numero: "58",
        complemento: "",
        bairro: "Centro",
        cidade: "Sao Caetano do Sul",
        estado: "SP"
    }
];

async function run() {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const { rows: [{ id: empresaId }] } = await client.query(
            "SELECT get_petflow_empresa_id() AS id"
        );

        for (const customer of demoCustomers) {
            const { rows } = await client.query(
                `
                    INSERT INTO clientes (
                        empresa_id,
                        nome,
                        cpf,
                        data_nascimento,
                        telefone,
                        whatsapp,
                        email,
                        cep,
                        endereco,
                        numero,
                        complemento,
                        bairro,
                        cidade,
                        estado,
                        observacoes,
                        ativo
                    )
                    VALUES (
                        $1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                        'Cliente demonstrativo para apresentacao do sistema.',
                        TRUE
                    )
                    ON CONFLICT (email)
                    DO UPDATE SET
                        nome = EXCLUDED.nome,
                        cpf = EXCLUDED.cpf,
                        data_nascimento = EXCLUDED.data_nascimento,
                        telefone = EXCLUDED.telefone,
                        whatsapp = EXCLUDED.whatsapp,
                        cep = EXCLUDED.cep,
                        endereco = EXCLUDED.endereco,
                        numero = EXCLUDED.numero,
                        complemento = EXCLUDED.complemento,
                        bairro = EXCLUDED.bairro,
                        cidade = EXCLUDED.cidade,
                        estado = EXCLUDED.estado,
                        ativo = TRUE,
                        updated_at = NOW()
                    RETURNING id;
                `,
                [
                    empresaId,
                    customer.nome,
                    customer.cpf,
                    customer.data_nascimento,
                    customer.telefone,
                    customer.email,
                    customer.cep,
                    customer.endereco,
                    customer.numero,
                    customer.complemento || null,
                    customer.bairro,
                    customer.cidade,
                    customer.estado
                ]
            );

            const clienteId = rows[0].id;

            await client.query(
                `
                    INSERT INTO usuarios_clientes (
                        cliente_id,
                        email,
                        senha_hash,
                        email_verificado,
                        token_verificacao_email,
                        token_verificacao_expiracao,
                        ativo
                    )
                    VALUES ($1, $2, $3, TRUE, NULL, NULL, TRUE)
                    ON CONFLICT (cliente_id)
                    DO UPDATE SET
                        email = EXCLUDED.email,
                        senha_hash = EXCLUDED.senha_hash,
                        email_verificado = TRUE,
                        token_verificacao_email = NULL,
                        token_verificacao_expiracao = NULL,
                        ativo = TRUE,
                        updated_at = NOW();
                `,
                [
                    clienteId,
                    customer.email,
                    passwordHash
                ]
            );

        }

        await client.query("COMMIT");

        console.log("Clientes demonstrativos criados com sucesso.");
        console.log(`Senha padrao: ${DEFAULT_PASSWORD}`);
        demoCustomers.forEach(customer => {
            console.log(`${customer.email} / ${DEFAULT_PASSWORD}`);
        });
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch((error) => {
    console.error("Erro ao criar clientes demonstrativos.");
    console.error(error);
    process.exitCode = 1;
});
