-- 021: quita el privilegio SQL de INSERT en las tablas de operaciones para
-- `authenticated`. RLS ya lo bloqueaba (no existe policy de insert para
-- ningún rol en 015), pero es mejor no depender solo de eso — sin el GRANT,
-- la operación es imposible en dos capas independientes, no solo una.

revoke insert on divisas.operations from authenticated;
revoke insert on divisas.international_transfers from authenticated;
revoke insert on divisas.crypto_transactions from authenticated;
revoke insert on divisas.cash_transactions from authenticated;
