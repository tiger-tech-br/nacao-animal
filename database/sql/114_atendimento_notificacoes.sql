/* Permite avisos de resposta do atendimento ao consumidor. */
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_tipo_check
CHECK (tipo IN ('CONSULTA', 'PROMOCAO', 'SISTEMA', 'ATENDIMENTO'));
