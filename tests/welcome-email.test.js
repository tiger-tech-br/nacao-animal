"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

require.cache[require.resolve("../config/env")] = {
    exports: { APP_URL: "https://loja.example.invalid", RESEND_API_KEY: "test-key", EMAIL_FROM: "Nação Animal <loja@example.invalid>" }
};
const email = require("../services/emailService");

test("boas-vindas apresenta a loja e convida a entrar sem confirmar e-mail", () => {
    const template = email.welcomeTemplate({
        name: "Ana Maria", email: "pessoal@example.invalid", cpf: "52998224725",
        endereco: "Rua particular", senha: "segredo", token: "token-privado"
    });

    assert.equal(template.subject, "Bem-vindo à Nação Animal");
    assert.match(template.html, /<h1>Bem-vindo à Nação Animal<\/h1>/);
    assert.match(template.html, /Ana, seu cadastro foi criado com sucesso/);
    assert.match(template.text, /Ana, seu cadastro foi criado com sucesso/);
    assert.match(template.html, /href="https:\/\/loja\.example\.invalid\/login"/);
    assert.match(template.html, /Entrar na minha conta/);
    assert.match(template.text, /Entre na sua conta: https:\/\/loja\.example\.invalid\/login/);

    const content = JSON.stringify(template);
    assert.doesNotMatch(content, /confirm|verificar_email|token=|senha|segredo|token-privado|52998224725|Rua particular|pessoal@example|Maria/i);
});

test("boas-vindas escapa o nome no HTML e mantém o texto legível", () => {
    const template = email.welcomeTemplate({ name: '<Ana&"\'> Sobrenome' });
    assert.match(template.html, /&lt;Ana&amp;&quot;&#039;&gt;, seu cadastro/);
    assert.doesNotMatch(template.html, /<Ana|Sobrenome/);
    assert.ok(template.text.includes('<Ana&"\'>, seu cadastro'));
    assert.doesNotMatch(template.text, /&lt;|&amp;|&quot;|&#039;/);
});

test("boas-vindas usa saudação neutra quando o nome está vazio", () => {
    const template = email.welcomeTemplate({ name: "   " });
    assert.match(template.text, /cliente, seu cadastro foi criado com sucesso/);
    assert.match(template.html, /cliente, seu cadastro foi criado com sucesso/);
    assert.doesNotMatch(template.html, /undefined|null/);
});

test("exclusão informa o fim do cadastro e do acesso com retenção mínima necessária", () => {
    const template = email.accountDeletedTemplate({
        name: "Ana Maria", email: "pessoal@example.invalid", cpf: "52998224725",
        endereco: "Rua particular", senha: "segredo", token: "token-privado"
    });
    assert.equal(template.subject, "Exclusão de cadastro na Nação Animal");
    for (const content of [template.html, template.text]) {
        assert.match(content, /Ana, seu cadastro e seu acesso à Nação Animal foram excluídos/);
        assert.match(content, /somente os registros mínimos necessários/);
        assert.match(content, /obrigações legais/);
        assert.match(content, /histórico obrigatório dos pedidos/);
        assert.match(content, /prazo aplicável/);
        assert.doesNotMatch(content, /todos os (dados|registros).*apagados|sem deixar registros/i);
    }
    assert.doesNotMatch(JSON.stringify(template), /senha|segredo|token-privado|token=|52998224725|Rua particular|pessoal@example|Maria/i);
});

test("exclusão escapa o nome no HTML e preserva uma saudação legível no texto", () => {
    const template = email.accountDeletedTemplate({ name: '<Ana&"\'> Sobrenome' });
    assert.match(template.html, /&lt;Ana&amp;&quot;&#039;&gt;, seu cadastro/);
    assert.doesNotMatch(template.html, /<Ana|Sobrenome/);
    assert.ok(template.text.includes('<Ana&"\'>, seu cadastro'));
    assert.doesNotMatch(template.text, /&lt;|&amp;|&quot;|&#039;/);
    assert.match(email.accountDeletedTemplate({ name: "" }).text, /cliente, seu cadastro/);
});
