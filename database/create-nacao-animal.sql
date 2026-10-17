-- Execute no Query Tool do pgAdmin conectado ao banco de manutencao postgres.
-- Se o banco nacao-animal ja existe, pule este arquivo e execute as migracoes.
-- Nao execute dentro de uma transacao. Nao altera o banco PetFlow original.
CREATE DATABASE "nacao-animal";
