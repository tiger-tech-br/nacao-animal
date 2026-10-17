"use strict";

window.PetFlowAdminPage = {
    key: "vendas",
    title: "Pedidos",
    subtitle: "Acompanhe pedidos recebidos, pagamento, separação e entrega.",
    endpoint: "/vendas",
    icon: "fa-bag-shopping",
    tableTitle: "Pedidos da loja",
    formTitle: "Detalhes do pedido",

    insights: [
        {
            key: "today",
            label: "Recebidos hoje",
            value: "0",
            note: "0 pedido(s) pendente(s)",
            icon: "fa-box-open"
        },
        {
            key: "delivery",
            label: "Em entrega",
            value: "0",
            note: "Pedido(s) em rota",
            icon: "fa-truck-fast"
        },
        {
            key: "paid",
            label: "Concluídos",
            value: "R$ 0,00",
            note: "Total concluído",
            icon: "fa-credit-card"
        },
        {
            key: "pending",
            label: "Pendências",
            value: "0",
            note: "Precisam de atenção",
            icon: "fa-circle-exclamation"
        }
    ],

    columns: [
        {
            key: "data_venda",
            label: "Data",
            type: "date"
        },
        {
            key: "cliente_nome",
            label: "Cliente"
        },
        {
            key: "quantidade_itens",
            label: "Itens"
        },
        {
            key: "valor_final",
            label: "Total",
            type: "currency"
        },
        {
            key: "forma_pagamento",
            label: "Pagamento",
            type: "payment"
        },
        {
            key: "status",
            label: "Status",
            type: "status"
        }
    ],

    fields: [
        {
            name: "status",
            label: "Status",
            type: "select",
            required: true,
            options: [
                {
                    value: "AGUARDANDO_PAGAMENTO",
                    label: "Aguardando pagamento"
                },
                {
                    value: "PAGAMENTO_APROVADO",
                    label: "Pedido recebido"
                },
                {
                    value: "EM_SEPARACAO",
                    label: "Preparando"
                },
                {
                    value: "SAIU_PARA_ENTREGA",
                    label: "Saiu para entrega"
                },
                {
                    value: "ENTREGUE",
                    label: "Entregue"
                },
                {
                    value: "FINALIZADA",
                    label: "Finalizado"
                },
                {
                    value: "CANCELADA",
                    label: "Cancelado"
                }
            ]
        }
    ],

    pipeline: [
        {
            status: "AGUARDANDO_PAGAMENTO",
            label: "Aguardando pagamento",
            value: "0",
            note: "Pedidos recebidos",
            icon: "fa-inbox"
        },
        {
            status: "EM_SEPARACAO",
            label: "Separando",
            value: "0",
            note: "Produtos em preparo",
            icon: "fa-box-open"
        },
        {
            status: "SAIU_PARA_ENTREGA",
            label: "Saiu para entrega",
            value: "0",
            note: "Motoboy em rota",
            icon: "fa-truck-fast"
        },
        {
            status: "ENTREGUE",
            label: "Entregue",
            value: "0",
            note: "Pedidos concluídos hoje",
            icon: "fa-circle-check"
        }
    ]
};
