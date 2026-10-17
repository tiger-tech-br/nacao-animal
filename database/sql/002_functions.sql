/*
==========================================================
 PETFLOW
 Arquivo: 002_functions.sql
 Descrição: Funções auxiliares utilizadas pelo sistema.
==========================================================
*/

/* ==========================================================
   FUNÇÃO: atualizar_updated_at()

   Atualiza automaticamente o campo updated_at sempre
   que um registro da tabela for alterado.
========================================================== */

CREATE OR REPLACE FUNCTION atualizar_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS
$$
BEGIN

    NEW.updated_at := NOW();

    RETURN NEW;

END;
$$;