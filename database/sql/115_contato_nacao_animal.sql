-- Dados de contato desta instalacao; preserva as migracoes anteriores.
UPDATE empresas
SET telefone = '(11) 4421-5284',
    cnpj = '14.506.937/0001-48',
    numero = '256',
    cep = '09060-820',
    endereco = COALESCE(NULLIF(TRIM(endereco), ''), 'Avenida Novo Horizonte'),
    bairro = COALESCE(NULLIF(TRIM(bairro), ''), 'Vila Sacadura Cabral'),
    cidade = COALESCE(NULLIF(TRIM(cidade), ''), 'Santo André'),
    estado = COALESCE(NULLIF(TRIM(estado), ''), 'SP'),
    updated_at = NOW()
WHERE id = get_petflow_empresa_id();
