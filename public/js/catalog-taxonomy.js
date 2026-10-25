/* Classificação compartilhada pelo cadastro e pela vitrine. */
(function catalogTaxonomy(root, factory) {
    "use strict";
    const taxonomy = factory();
    if (typeof module === "object" && module.exports) module.exports = taxonomy;
    else root.NacaoCatalogTaxonomy = taxonomy;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTaxonomy() {
    "use strict";
    const types = {
        racoes: { slug: "racoes", label: "Rações" },
        "racoes-umidas": { slug: "racoes-umidas", label: "Rações úmidas" },
        acessorios: { slug: "acessorios", label: "Acessórios" },
        "terras-fertilizantes": { slug: "terras-fertilizantes", label: "Terras e fertilizantes" }
    };
    const petTypes = [types.racoes, types["racoes-umidas"], types.acessorios];
    const smallPetTypes = [types.racoes, types.acessorios];
    const categories = {
        caes: {
            slug: "caes", label: "Cães", title: "Produtos para cães",
            description: "Rações, rações úmidas e acessórios para cuidar do seu cachorro.",
            image: "/images/categories/dogs-v2.jpg", subcategories: petTypes,
            keywords: ["cao", "caes", "cachorro", "cachorros", "canis", "bifinho", "coleira"]
        },
        gatos: {
            slug: "gatos", label: "Gatos", title: "Produtos para gatos",
            description: "Rações, rações úmidas e acessórios para o dia a dia dos felinos.",
            image: "/images/categories/cats-v2.jpg", subcategories: petTypes,
            keywords: ["gato", "gatos", "felis", "castrados", "felino", "felinos"]
        },
        aves: {
            slug: "aves", label: "Pássaros", title: "Produtos para pássaros",
            description: "Rações e acessórios para os seus pássaros de estimação.",
            image: "/images/categories/birds-v2.jpg", subcategories: smallPetTypes,
            keywords: ["ave", "aves", "passaro", "passaros", "calopsita", "periquito"]
        },
        peixes: {
            slug: "peixes", label: "Peixes", title: "Produtos para peixes",
            description: "Rações e acessórios para os peixes e o seu aquário.",
            image: "/images/categories/fish-v2.jpg", subcategories: smallPetTypes,
            keywords: ["peixe", "peixes", "aquario", "aquarios"]
        },
        roedores: {
            slug: "roedores", label: "Roedores", title: "Produtos para roedores",
            description: "Rações e acessórios para hamster e outros pequenos pets.",
            image: "/images/categories/rodents-v2.jpg", subcategories: smallPetTypes,
            keywords: ["roedor", "roedores", "hamster", "coelho", "porquinho"]
        },
        repteis: {
            slug: "repteis", label: "Répteis", title: "Rações para tartarugas e jabutis",
            description: "Rações para tartarugas e jabutis. Nesta categoria, a loja trabalha somente com alimentação.",
            image: "/images/categories/reptiles.jpg", subcategories: [types.racoes],
            keywords: ["reptil", "repteis", "tartaruga", "tartarugas", "jabuti", "jabutis"]
        },
        jardinagem: {
            slug: "jardinagem", label: "Jardinagem", title: "Tudo para a sua jardinagem",
            description: "Terras, fertilizantes e acessórios para cuidar das suas plantas.",
            image: "/images/categories/gardening-v2.jpg",
            subcategories: [types["terras-fertilizantes"], types.acessorios],
            keywords: ["jardinagem", "jardim", "terra", "terras", "fertilizante", "fertilizantes", "adubo", "substrato", "plantas"]
        },
        acessorios: {
            slug: "acessorios", label: "Acessórios", title: "Acessórios para pets",
            description: "Coleiras, brinquedos, camas e acessórios para a rotina do pet.",
            image: "/images/categories/accessories-v2.jpg", subcategories: [],
            keywords: ["acessorio", "acessorios", "coleira", "brinquedo", "cama", "mordedor"]
        }
    };

    function normalize(value) {
        return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    }
    function slugify(value) { return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
    function getCategory(value) {
        let slug = slugify(value);
        if (["passaros", "passaro", "ave"].includes(slug)) slug = "aves";
        if (slug === "reptil") slug = "repteis";
        return categories[slug] || null;
    }
    function normalizeSubcategory(value) {
        const slug = slugify(value);
        if (types[slug]) return slug;
        if (["terras-e-fertilizantes", "terra-e-fertilizante", "terras-fertilizantes"].includes(slug)) return "terras-fertilizantes";
        return "";
    }
    function getProductSubcategory(product) {
        const explicit = normalizeSubcategory(product.subcategoria);
        if (explicit) return explicit;
        // Compatibilidade com o catálogo anterior ao campo de subcategoria.
        const words = normalize([product.nome, product.categoria].filter(Boolean).join(" "));
        const parent = getCategory(product.categoria);
        if (parent?.slug === "jardinagem" || /\b(terra|terras|adubo|fertilizante|fertilizantes|substrato)\b/.test(words)) {
            return /\b(terra|terras|adubo|fertilizante|fertilizantes|substrato)\b/.test(words) ? "terras-fertilizantes" : "acessorios";
        }
        if (/\b(umida|umidas|sache|saches|pate|pates|enlatado|enlatados)\b/.test(words)) {
            return parent && !parent.subcategories.some(type => type.slug === "racoes-umidas") && parent.slug !== "acessorios" ? "racoes" : "racoes-umidas";
        }
        if (/\b(racao|racoes|alimento|alimentos|sementes|farinhada)\b/.test(words)) return "racoes";
        if (parent?.slug === "acessorios" || /\b(acessorio|acessorios|coleira|guia|brinquedo|varinha|comedouro|bebedouro|cama|caminha|mordedor|poleiro|enfeite|saquinho|saquinhos|transporte|vaso|regador|ferramenta)\b/.test(words)) return "acessorios";
        return "";
    }
    function matchesCategory(product, value) {
        const category = typeof value === "object" ? value : getCategory(value);
        if (!category) return false;
        const parent = getCategory(product.categoria);
        if (category.slug === "acessorios") {
            return parent?.slug !== "jardinagem" && getProductSubcategory(product) === "acessorios";
        }
        if (parent && parent.slug !== "acessorios") return parent.slug === category.slug;
        // Em cadastros antigos, o nome indica o público antes de ingredientes ou
        // termos genéricos como "coleira". Assim "sabor peixe para gatos" fica em Gatos.
        const name = normalize(product.nome);
        const species = [
            ["caes", /\b(cao|caes|cachorros?|canis)\b/],
            ["gatos", /\b(gatos?|felinos?|felis)\b/],
            ["aves", /\b(aves?|passaros?|calopsitas?|periquitos?)\b/],
            ["roedores", /\b(roedores?|hamsters?|coelhos?|porquinhos?)\b/],
            ["repteis", /\b(reptil|repteis|tartarugas?|jabutis?)\b/]
        ].filter(([, pattern]) => pattern.test(name)).map(([slug]) => slug);
        if (species.length) return species.includes(category.slug);
        const words = normalize([product.nome, product.descricao, product.categoria, product.sku].filter(Boolean).join(" ")).split(/[^a-z0-9]+/);
        return category.keywords.some(keyword => words.includes(keyword) || words.includes(`${keyword}s`));
    }
    return { categories, types, getCategory, normalizeSubcategory, getProductSubcategory, matchesCategory };
});
