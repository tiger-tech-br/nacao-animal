/*
==========================================================
PETFLOW
Arquivo: 001_extensions.sql
Descrição: Extensões necessárias para funcionamento
do banco de dados.
==========================================================
*/

/*
==========================================================
EXTENSÃO: pgcrypto

Responsável pela função:

gen_random_uuid()

Utilizada como chave primária em todas as tabelas.
==========================================================
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;