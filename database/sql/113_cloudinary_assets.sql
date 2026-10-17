-- As URLs existentes são preservadas; a aplicação reconhece URLs legadas da própria conta.
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS foto_public_id TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS logo_public_id TEXT;
