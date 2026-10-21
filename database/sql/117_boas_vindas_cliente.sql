/* Boas-vindas persistentes: uma mensagem por conta, sem reabrir avisos já lidos. */
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_tipo_check
CHECK (tipo IN ('CONSULTA', 'PROMOCAO', 'SISTEMA', 'ATENDIMENTO', 'BOAS_VINDAS'));

/* O cadastro anterior já criava uma mensagem SISTEMA; preserve seu ID e leitura. */
WITH legadas AS (
    SELECT DISTINCT ON (n.cliente_id) n.id
    FROM notificacoes n
    INNER JOIN usuarios_clientes u ON u.cliente_id = n.cliente_id
    WHERE n.tipo = 'SISTEMA'
      AND n.titulo = 'Bem-vindo à Nação Animal'
      AND n.venda_id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM notificacoes atual
          WHERE atual.cliente_id = n.cliente_id AND atual.tipo = 'BOAS_VINDAS'
      )
    ORDER BY n.cliente_id, n.enviada_em, n.id
)
UPDATE notificacoes n SET tipo = 'BOAS_VINDAS'
FROM legadas WHERE n.id = legadas.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notificacoes_boas_vindas_cliente
ON notificacoes(cliente_id) WHERE tipo = 'BOAS_VINDAS';

/* Clientes administrativos sem conta não recebem um aviso que não podem abrir. */
INSERT INTO notificacoes (cliente_id, titulo, mensagem, tipo)
SELECT c.id, 'Bem-vindo à Nação Animal',
       'Seu cadastro está pronto. Aqui você acompanha seus pedidos e as novidades da Nação Animal.',
       'BOAS_VINDAS'
FROM clientes c
INNER JOIN usuarios_clientes u ON u.cliente_id = c.id
ON CONFLICT (cliente_id) WHERE tipo = 'BOAS_VINDAS' DO NOTHING;

CREATE OR REPLACE FUNCTION notificar_boas_vindas_cliente() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notificacoes (cliente_id, titulo, mensagem, tipo)
    VALUES (
        NEW.cliente_id,
        'Bem-vindo à Nação Animal',
        'Seu cadastro está pronto. Aqui você acompanha seus pedidos e as novidades da Nação Animal.',
        'BOAS_VINDAS'
    )
    ON CONFLICT (cliente_id) WHERE tipo = 'BOAS_VINDAS' DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notificar_boas_vindas_cliente ON usuarios_clientes;
CREATE TRIGGER trg_notificar_boas_vindas_cliente AFTER INSERT ON usuarios_clientes
FOR EACH ROW EXECUTE FUNCTION notificar_boas_vindas_cliente();
