-- Categoria de alimentação: a classificação compartilhada oferece somente Rações.
INSERT INTO categorias (empresa_id, nome, descricao, ativo, status)
SELECT get_petflow_empresa_id(), 'Répteis',
       'Rações para tartarugas e jabutis.', TRUE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM categorias
    WHERE empresa_id = get_petflow_empresa_id() AND LOWER(TRIM(nome)) = 'répteis'
)
ON CONFLICT (nome) DO NOTHING;
