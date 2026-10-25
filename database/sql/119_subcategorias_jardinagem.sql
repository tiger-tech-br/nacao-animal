-- Classificacao opcional: preserva os produtos e estoques do catalogo existente.
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS subcategoria TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_produtos_subcategoria' AND conrelid = 'produtos'::regclass
    ) THEN
        ALTER TABLE produtos ADD CONSTRAINT chk_produtos_subcategoria
        CHECK (subcategoria IS NULL OR subcategoria IN (
            'racoes', 'racoes-umidas', 'acessorios', 'terras-fertilizantes'
        ));
    END IF;
END;
$$;

INSERT INTO categorias (empresa_id, nome, descricao, ativo, status)
SELECT get_petflow_empresa_id(), 'Jardinagem',
       'Terras, fertilizantes e acessórios para cuidar do jardim.', TRUE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM categorias
    WHERE empresa_id = get_petflow_empresa_id() AND LOWER(TRIM(nome)) = 'jardinagem'
)
ON CONFLICT (nome) DO NOTHING;
