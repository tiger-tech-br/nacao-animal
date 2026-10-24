"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs");
const source = fs.readFileSync("public/js/pages/auth/login.js", "utf8");
for (const [search, expected] of [
    ["?next=%2Fadmin%2Ftestar-gps", "/admin/testar-gps"],
    ["?next=%2Fadmin%2Fsimular-navegacao", "/admin/simular-navegacao"],
    ["", "/admin/pages/dashboard/dashboard.html"],
    ["?next=https://external.invalid/", "/admin/pages/dashboard/dashboard.html"],
    ["?next=//external.invalid/", "/admin/pages/dashboard/dashboard.html"],
    ["?next=/admin/testar-gps?unsafe=1", "/admin/pages/dashboard/dashboard.html"],
    ["?next=/admin/simular-navegacao?unsafe=1", "/admin/pages/dashboard/dashboard.html"],
    ["?next=/admin/simular-navegacao%23fragment", "/admin/pages/dashboard/dashboard.html"],
    ["?next=/admin/simular-navegacao/../other", "/admin/pages/dashboard/dashboard.html"],
    ["?next=%252Fadmin%252Fsimular-navegacao", "/admin/pages/dashboard/dashboard.html"],
    ["?next=%5C%5Cexternal.invalid%5Cadmin%5Csimular-navegacao", "/admin/pages/dashboard/dashboard.html"]
]) test(`login retorna somente aos testes administrativos autorizados: ${search || "padrao"}`, async () => {
    const saved=[];
    const context={URLSearchParams, document:{addEventListener(){},getElementById:id=>({value:id==="email"?"fixture@example.invalid":"fixture-password"})},
        validateRequired:()=>true,validateEmail:()=>true,validatePassword:()=>true,
        AuthService:{login:async()=>({data:{token:"fixture-token",user:{perfil:"ADMIN"}}})},
        saveToken:value=>saved.push(value),saveUser:value=>saved.push(value),alert(){assert.fail("login nao deve falhar");},
        window:{location:{search}}};
    vm.runInNewContext(source,context);
    await context.handleLogin({preventDefault(){}});
    assert.equal(context.window.location.href,expected);
    assert.equal(saved.length,2);
});
