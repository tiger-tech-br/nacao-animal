"use strict";

/* ==================================================
   ELEMENTOS
================================================== */

const tabelaVendas = document.querySelector("#tabelaVendas");

const formularioVenda = document.querySelector("#formVenda");

const btnNovaVenda = document.querySelector("#btnNovaVenda");

const btnSalvarVenda = document.querySelector("#btnSalvarVenda");

const btnCancelarVenda = document.querySelector("#btnCancelarVenda");

const btnFecharModal = document.querySelector("#btnFecharModal");

const modalVenda = document.querySelector("#modalVenda");

const modalConfirmacao = document.querySelector("#modalConfirmacao");

const pesquisarVenda = document.querySelector("#pesquisarVenda");
const buscarCliente = document.querySelector("#buscarCliente");
const buscarProduto = document.querySelector("#buscarProduto");
const modalCliente = document.querySelector("#modalCliente");
const modalProduto = document.querySelector("#modalProduto");
const clienteSelecionado = document.querySelector("#clienteSelecionado");
const listaProdutos = document.querySelector("#listaProdutos");

/* ==================================================
   ESTADO
================================================== */

let vendaEditando = null;

let vendaSelecionada = null;
let vendasCarregadas = [];
let clientesCarregados = [];
let produtosCarregados = [];

/* ==================================================
   INICIALIZAÇÃO
================================================== */

document.addEventListener(

    "DOMContentLoaded",

    inicializar

);

/* ==================================================
   INICIALIZAR
================================================== */

function inicializar() {

    configurarEventos();

    carregarVendas();

    carregarDadosPesquisa();

}

/* ==================================================
   EVENTOS
================================================== */

function configurarEventos() {

    if (formularioVenda) {

        formularioVenda.addEventListener(

            "submit",

            salvarVenda

        );

    }

    if (btnNovaVenda) {

        btnNovaVenda.addEventListener(

            "click",

            abrirModalVenda

        );

    }

    if (btnCancelarVenda) {

        btnCancelarVenda.addEventListener(

            "click",

            cancelarVendaAtual

        );

    }

    if (btnFecharModal) {

        btnFecharModal.addEventListener(

            "click",

            fecharModalVenda

        );

    }

    if (pesquisarVenda) {

        pesquisarVenda.addEventListener(

            "input",

            pesquisarVendas

        );

    }

    configurarCampoBusca(buscarCliente, pesquisarClientes);
    configurarCampoBusca(modalCliente, pesquisarClientes);
    configurarCampoBusca(buscarProduto, pesquisarProdutos);
    configurarCampoBusca(modalProduto, pesquisarProdutos);

    configurarEventosTabela();

}

function configurarCampoBusca(input, callback) {

    if (!input) return;

    input.addEventListener("input", event => {

        callback(event.target.value, input);

    });

}

/* ==================================================
   EVENTOS DA TABELA
================================================== */

function configurarEventosTabela() {

    if (!tabelaVendas) return;

    tabelaVendas.addEventListener(

        "click",

        eventoTabela

    );

}

/* ==================================================
   DELEGAÇÃO DE EVENTOS
================================================== */

function eventoTabela(event) {

    const botao = event.target.closest("button");

    if (!botao) return;

    const id = Number(

        botao.dataset.id

    );

    if (botao.classList.contains("btn-editar")) {

        editarVenda(id);

        return;

    }

    if (botao.classList.contains("btn-excluir")) {

        excluirVenda(id);

        return;

    }

    if (botao.classList.contains("btn-finalizar")) {

        finalizarVenda(id);

        return;

    }

    if (botao.classList.contains("btn-cancelar")) {

        cancelarVenda(id);

        return;

    }

}

/* ==================================================
   MODAL
================================================== */

function abrirModalVenda() {

    vendaEditando = null;

    formularioVenda.reset();

    modalVenda.showModal();

}

function fecharModalVenda() {

    modalVenda.close();

}

function cancelarVendaAtual() {

    formularioVenda.reset();

    vendaEditando = null;

    fecharModalVenda();

}

/* ==================================================
   CARREGAR VENDAS
================================================== */

async function carregarVendas() {

    try {

        const vendas = normalizarResposta(

            await VendaService.getAll()

        );

        vendasCarregadas = Array.isArray(vendas) ? vendas : [];

        renderizarTabela(vendasCarregadas);

    }

    catch (error) {

        console.error(error);

        alert("Erro ao carregar as vendas.");

    }

}

async function carregarDadosPesquisa() {

    try {

        const [clientes, produtos] = await Promise.all([

            apiGet("/clientes"),

            apiGet("/produtos")

        ]);

        clientesCarregados = normalizarResposta(clientes);

        produtosCarregados = normalizarResposta(produtos);

        pesquisarProdutos(buscarProduto?.value || "", buscarProduto);

    } catch (error) {

        console.error("Erro ao carregar dados de pesquisa:", error);

    }

}

/* ==================================================
   RENDERIZAR TABELA
================================================== */

function renderizarTabela(vendas) {

    if (!tabelaVendas) return;

    tabelaVendas.replaceChildren();

    if (!Array.isArray(vendas) || vendas.length === 0) {

        tabelaVendas.appendChild(

            criarLinhaSemRegistros()

        );

        return;

    }

    vendas.forEach(venda => {

        tabelaVendas.appendChild(

            criarLinhaVenda(venda)

        );

    });

}

/* ==================================================
   LINHA SEM REGISTROS
================================================== */

function criarLinhaSemRegistros() {

    const tr = document.createElement("tr");

    const td = document.createElement("td");

    td.colSpan = 6;

    td.textContent = "Nenhuma venda encontrada.";

    td.classList.add("text-center");

    tr.appendChild(td);

    return tr;

}

/* ==================================================
   LINHA DA VENDA
================================================== */

function criarLinhaVenda(venda) {

    const tr = document.createElement("tr");

    tr.append(

        criarColuna(venda.id),

        criarColuna(

            venda.cliente || "-"

        ),

        criarColuna(

            venda.forma_pagamento

        ),

        criarColuna(

            formatarMoeda(venda.total)

        ),

        criarColuna(

            venda.status

        ),

        criarColunaAcoes(venda.id)

    );

    return tr;

}

/* ==================================================
   COLUNA
================================================== */

function criarColuna(valor) {

    const td = document.createElement("td");

    td.textContent = valor;

    return td;

}

/* ==================================================
   COLUNA DE AÇÕES
================================================== */

function criarColunaAcoes(id) {

    const td = document.createElement("td");

    td.append(

        criarBotao(

            "Editar",

            "btn-editar",

            id

        ),

        criarBotao(

            "Excluir",

            "btn-excluir",

            id

        ),

        criarBotao(

            "Finalizar",

            "btn-finalizar",

            id

        ),

        criarBotao(

            "Cancelar",

            "btn-cancelar",

            id

        )

    );

    return td;

}

/* ==================================================
   BOTÃO
================================================== */

function criarBotao(

    texto,

    classe,

    id

) {

    const button = document.createElement(

        "button"

    );

    button.type = "button";

    button.textContent = texto;

    button.dataset.id = id;

    button.className = classe;

    return button;

}

/* ==================================================
   FORMATAR MOEDA
================================================== */

function formatarMoeda(valor) {

    return Number(valor).toLocaleString(

        "pt-BR",

        {

            style: "currency",

            currency: "BRL"

        }

    );

}

/* ==================================================
   SALVAR
================================================== */

async function salvarVenda(event) {

    event.preventDefault();

    const formaPagamento = document.querySelector(

        "#formaPagamento"

    );

    if (

        !validateRequired(

            formaPagamento,

            "Selecione a forma de pagamento."

        )

    ) {

        return;

    }

    try {

        const venda = obterDadosFormulario();

        if (vendaEditando) {

            await VendaService.update(

                vendaEditando,

                venda

            );

        }

        else {

            await VendaService.create(

                venda

            );

        }

        formularioVenda.reset();

        vendaEditando = null;

        fecharModalVenda();

        carregarVendas();

    }

    catch (error) {

        console.error(error);

        alert("Erro ao salvar a venda.");

    }

}

/* ==================================================
   EDITAR
================================================== */

async function editarVenda(id) {

    try {

        const venda = await VendaService.getById(id);

        vendaEditando = id;

        preencherFormulario(venda);

        abrirModalVenda();

    }

    catch (error) {

        console.error(error);

        alert("Erro ao carregar a venda.");

    }

}

/* ==================================================
   EXCLUIR
================================================== */

async function excluirVenda(id) {

    if (

        !confirm(

            "Deseja realmente excluir esta venda?"

        )

    ) {

        return;

    }

    try {

        await VendaService.delete(id);

        carregarVendas();

    }

    catch (error) {

        console.error(error);

        alert("Erro ao excluir a venda.");

    }

}

/* ==================================================
   FINALIZAR
================================================== */

async function finalizarVenda(id) {

    try {

        await VendaService.finish(id);

        carregarVendas();

    }

    catch (error) {

        console.error(error);

        alert("Erro ao finalizar a venda.");

    }

}

/* ==================================================
   CANCELAR
================================================== */

async function cancelarVenda(id) {

    if (

        !confirm(

            "Cancelar esta venda?"

        )

    ) {

        return;

    }

    try {

        await VendaService.cancel(id);

        carregarVendas();

    }

    catch (error) {

        console.error(error);

        alert("Erro ao cancelar a venda.");

    }

}

/* ==================================================
   PESQUISA
================================================== */

function pesquisarVendas(event) {

    const texto = normalizarTexto(event.target.value);

    if (!texto) {

        renderizarTabela(vendasCarregadas);

        return;

    }

    const vendasFiltradas = vendasCarregadas.filter(venda =>

        normalizarTexto([

            venda.id,

            venda.cliente,

            venda.cliente_nome,

            venda.forma_pagamento,

            venda.status,

            venda.total,

            venda.valor_total,

            venda.valor_final

        ].filter(Boolean).join(" ")).includes(texto)

    );

    renderizarTabela(vendasFiltradas);

}

function pesquisarClientes(termo, input) {

    const texto = normalizarTexto(termo);

    const destino = input === modalCliente

        ? obterPainelResultados(input)

        : clienteSelecionado;

    if (!destino) return;

    if (!texto) {

        destino.innerHTML = input === modalCliente ? "" : "Nenhum cliente selecionado.";

        return;

    }

    const encontrados = clientesCarregados

        .filter(cliente => normalizarTexto([

            cliente.nome,

            cliente.email,

            cliente.telefone,

            cliente.whatsapp,

            cliente.cpf,

            cliente.cidade

        ].filter(Boolean).join(" ")).includes(texto))

        .slice(0, 8);

    if (!encontrados.length) {

        destino.innerHTML = `<div class="empty-state">Nenhum cliente encontrado.</div>`;

        return;

    }

    destino.innerHTML = encontrados.map(cliente => `
        <button class="search-result-item" type="button" data-client-id="${escapeHtml(cliente.id)}">
            <strong>${escapeHtml(cliente.nome || "Cliente")}</strong>
            <span>${escapeHtml(cliente.telefone || cliente.whatsapp || cliente.email || "")}</span>
        </button>
    `).join("");

    destino.querySelectorAll("[data-client-id]").forEach(button => {

        button.addEventListener("click", () => selecionarCliente(button.dataset.clientId, input));

    });

}

function pesquisarProdutos(termo, input) {

    const texto = normalizarTexto(termo);

    const destino = input === modalProduto

        ? obterPainelResultados(input)

        : listaProdutos;

    if (!destino) return;

    const produtos = texto

        ? produtosCarregados.filter(produto => normalizarTexto([

            produto.nome,

            produto.descricao,

            produto.categoria,

            produto.marca,

            produto.fornecedor,

            produto.sku,

            produto.codigo_barras

        ].filter(Boolean).join(" ")).includes(texto))

        : produtosCarregados.slice(0, 8);

    const encontrados = produtos.slice(0, 10);

    if (!encontrados.length) {

        destino.innerHTML = `<div class="empty-state">Nenhum produto encontrado.</div>`;

        return;

    }

    destino.innerHTML = encontrados.map(produto => `
        <button class="search-result-item product-search-item" type="button" data-product-id="${escapeHtml(produto.id)}">
            <strong>${escapeHtml(produto.nome || "Produto")}</strong>
            <span>${formatarMoeda(produto.preco || produto.preco_venda || 0)}${produto.fornecedor ? ` - ${escapeHtml(produto.fornecedor)}` : ""}</span>
        </button>
    `).join("");

}

function selecionarCliente(id, input) {

    const cliente = clientesCarregados.find(item => String(item.id) === String(id));

    if (!cliente) return;

    const clienteId = document.querySelector("#clienteId");

    if (clienteId) clienteId.value = cliente.id;

    if (input) input.value = cliente.nome || "";

    if (clienteSelecionado) {

        clienteSelecionado.innerHTML = `
            <strong>${escapeHtml(cliente.nome || "Cliente")}</strong>
            <span>${escapeHtml(cliente.telefone || cliente.whatsapp || cliente.email || "")}</span>
        `;

    }

}

function obterPainelResultados(input) {

    if (!input) return null;

    let painel = input.parentElement?.querySelector(".search-results");

    if (!painel) {

        painel = document.createElement("div");

        painel.className = "search-results";

        input.insertAdjacentElement("afterend", painel);

    }

    return painel;

}

function normalizarResposta(resposta) {

    if (Array.isArray(resposta)) return resposta;

    if (Array.isArray(resposta?.data)) return resposta.data;

    return [];

}

function normalizarTexto(valor) {

    return String(valor || "")

        .normalize("NFD")

        .replace(/[\u0300-\u036f]/g, "")

        .trim()

        .toLowerCase();

}

function escapeHtml(valor) {

    return String(valor || "")

        .replaceAll("&", "&amp;")

        .replaceAll("<", "&lt;")

        .replaceAll(">", "&gt;")

        .replaceAll('"', "&quot;")

        .replaceAll("'", "&#039;");

}

/* ==================================================
   DADOS DO FORMULÁRIO
================================================== */

function obterDadosFormulario() {

    return {

        clienteId:

            document.querySelector(

                "#clienteId"

            )?.value || null,

        formaPagamento:

            document.querySelector(

                "#formaPagamento"

            ).value,

        observacoes:

            document.querySelector(

                "#observacoes"

            ).value.trim(),

        desconto:

            Number(

                document.querySelector(

                    "#desconto"

                )?.value || 0

            ),

        acrescimo:

            Number(

                document.querySelector(

                    "#acrescimo"

                )?.value || 0

            )

    };

}

/* ==================================================
   PREENCHER FORMULÁRIO
================================================== */

function preencherFormulario(venda) {

    document.querySelector(

        "#formaPagamento"

    ).value = venda.forma_pagamento;

    document.querySelector(

        "#observacoes"

    ).value = venda.observacoes || "";

    document.querySelector(

        "#desconto"

    ).value = venda.desconto || 0;

    document.querySelector(

        "#acrescimo"

    ).value = venda.acrescimo || 0;

}

/* ==================================================
   LIMPAR FORMULÁRIO
================================================== */

function limparFormulario() {

    formularioVenda.reset();

    vendaEditando = null;

}

/* ==================================================
   EXPORTAÇÃO
================================================== */

window.editarVenda = editarVenda;

window.excluirVenda = excluirVenda;

window.finalizarVenda = finalizarVenda;

window.cancelarVenda = cancelarVenda;
