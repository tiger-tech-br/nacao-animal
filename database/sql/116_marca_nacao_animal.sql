-- Identidade desta loja, aplicada sem alterar as migracoes herdadas do PetFlow.
UPDATE empresas
SET nome = 'Nação Animal',
    logo = '/images/logo/nacao-animal-logo-transparent.png',
    logo_public_id = NULL,
    updated_at = NOW()
WHERE id = get_petflow_empresa_id();
