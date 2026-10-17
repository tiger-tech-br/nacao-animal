"use strict";

const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const { buildDbOptions } = require("../config/dbOptions");

require("dotenv").config();

const pool = new Pool(buildDbOptions());

async function run() {
    const admin = {
        nome: String(process.env.ADMIN_NAME || "Administrador").trim(),
        email: String(process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
        senha: String(process.env.ADMIN_PASSWORD || ""),
        perfil: "ADMIN"
    };
    if (!admin.email || !/^\S+@\S+\.\S+$/.test(admin.email)) {
        throw new Error("Configure ADMIN_EMAIL com um e-mail valido antes de executar o seed.");
    }
    if (admin.senha.length < 12 || !/[a-z]/.test(admin.senha) ||
        !/[A-Z]/.test(admin.senha) || !/\d/.test(admin.senha) || !/[^A-Za-z0-9]/.test(admin.senha)) {
        throw new Error("Configure ADMIN_PASSWORD com ao menos 12 caracteres, incluindo maiuscula, minuscula, numero e simbolo.");
    }
    const senhaHash = await bcrypt.hash(admin.senha, 10);

    const { rows } = await pool.query(
        `
            INSERT INTO usuarios (
                empresa_id,
                nome,
                email,
                senha_hash,
                perfil,
                ativo
            )
            VALUES (
                get_petflow_empresa_id(),
                $1,
                $2,
                $3,
                $4,
                TRUE
            )
            ON CONFLICT (email)
            DO UPDATE SET
                nome = EXCLUDED.nome,
                senha_hash = EXCLUDED.senha_hash,
                perfil = EXCLUDED.perfil,
                ativo = TRUE,
                updated_at = NOW()
            RETURNING id, nome, email, perfil, ativo;
        `,
        [
            admin.nome,
            admin.email,
            senhaHash,
            admin.perfil
        ]
    );

    console.log("Usuario admin pronto:");
    console.log(rows[0]);
}

run()
    .catch((error) => {
        console.error("Erro ao criar usuario admin.");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
