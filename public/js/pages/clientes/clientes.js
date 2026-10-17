/* ==================================================
   CLIENTES
================================================== */

document.addEventListener("DOMContentLoaded", () => {

    inicializarClientes();

});

/* ==================================================
   ESTADO
================================================== */

const clientesState = {

    clientes: [],

    clientesFiltrados: [],

    paginaAtual: 1,

    itensPorPagina: 10,

    termoPesquisa: "",

    status: "todos"

};

/* ==================================================
   INICIALIZAÇÃO
================================================== */

async function inicializarClientes() {

    configurarEventos();

    await carregarClientes();

}

/* ==================================================
   EVENTOS
================================================== */

function configurarEventos() {

    configurarPesquisa();

    configurarFiltros();

}

/* ==================================================
   CARREGAMENTO
================================================== */

async function carregarClientes() {

    try {

        /*
        Futuramente:

        const clientes = await api.get("/clientes");

        clientesState.clientes = clientes;
        */

        clientesState.clientes = [];

        clientesState.clientesFiltrados = [...clientesState.clientes];

        renderizarTabela();

        atualizarPaginacao();

    } catch (error) {

        console.error("Erro ao carregar clientes:", error);

    }

}

/* ==================================================
   PESQUISA
================================================== */

function configurarPesquisa() {

    const inputPesquisa = document.querySelector("#pesquisaClientes");

    if (!inputPesquisa) return;

    inputPesquisa.addEventListener("input", (event) => {

        clientesState.termoPesquisa = event.target.value.trim().toLowerCase();

        aplicarFiltros();

    });

}

/* ==================================================
   FILTROS
================================================== */

function configurarFiltros() {

    const selectStatus = document.querySelector("#statusCliente");

    if (!selectStatus) return;

    selectStatus.addEventListener("change", (event) => {

        clientesState.status = event.target.value;

        aplicarFiltros();

    });

}

/* ==================================================
   FILTRAGEM
================================================== */

function aplicarFiltros() {

    let lista = [...clientesState.clientes];

    if (clientesState.termoPesquisa) {

        lista = lista.filter(cliente =>

            cliente.nome
                .toLowerCase()
                .includes(clientesState.termoPesquisa)

        );

    }

    if (clientesState.status !== "todos") {

        lista = lista.filter(cliente =>

            cliente.status === clientesState.status

        );

    }

    clientesState.clientesFiltrados = lista;

    clientesState.paginaAtual = 1;

    renderizarTabela();

    atualizarPaginacao();

}

/* ==================================================
   TABELA
================================================== */

function renderizarTabela() {

    const tbody = document.querySelector("#clientesTableBody");

    if (!tbody) return;

    tbody.innerHTML = "";

    if (!clientesState.clientesFiltrados.length) {

        tbody.innerHTML = `

            <tr>

                <td colspan="8" class="table-empty">

                    Nenhum cliente encontrado.

                </td>

            </tr>

        `;

        return;

    }

    const inicio =

        (clientesState.paginaAtual - 1) *

        clientesState.itensPorPagina;

    const fim =

        inicio +

        clientesState.itensPorPagina;

    const clientes =

        clientesState.clientesFiltrados.slice(inicio, fim);

    clientes.forEach(cliente => {

        tbody.insertAdjacentHTML("beforeend", criarLinha(cliente));

    });

}

/* ==================================================
   LINHA
================================================== */

function criarLinha(cliente) {

    return `

        <tr>

            <td>${cliente.nome}</td>

            <td>${cliente.telefone}</td>

            <td>${cliente.email}</td>


            <td>${cliente.cidade}</td>

            <td>${cliente.status}</td>

            <td>

                <button onclick="visualizarCliente(${cliente.id})">

                    Ver

                </button>

            </td>

        </tr>

    `;

}

/* ==================================================
   AÇÕES
================================================== */

function visualizarCliente(id) {

    console.log("Visualizar:", id);

}

function editarCliente(id) {

    console.log("Editar:", id);

}


function visualizarHistorico(id) {

    console.log("Histórico:", id);

}

function inativarCliente(id) {

    console.log("Inativar:", id);

}

/* ==================================================
   PAGINAÇÃO
================================================== */

function atualizarPaginacao() {

    // Implementaremos após criar o componente de paginação.

}