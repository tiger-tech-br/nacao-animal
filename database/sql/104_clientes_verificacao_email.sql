/*
==========================================================
 PETFLOW
 Arquivo: 104_clientes_verificacao_email.sql
 Descricao: Token de confirmacao do e-mail dos clientes.
==========================================================
*/

ALTER TABLE usuarios_clientes
ADD COLUMN IF NOT EXISTS token_verificacao_email VARCHAR(255);

ALTER TABLE usuarios_clientes
ADD COLUMN IF NOT EXISTS token_verificacao_expiracao TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_usuarios_clientes_token_verificacao_email
ON usuarios_clientes(token_verificacao_email);

UPDATE usuarios_clientes
SET email_verificado = TRUE
WHERE email_verificado = FALSE
  AND token_verificacao_email IS NULL;
