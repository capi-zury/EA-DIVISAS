-- 024: operation_date/operation_time deben calcularse en hora de México, no
-- en UTC (el timezone de sesión por default en Supabase).
--
-- Antes: default current_date / current_time → usa el TimeZone de la
-- sesión (UTC). México es UTC-6, así que cualquier operación registrada
-- entre las 6pm y medianoche hora local caía "en el futuro" en UTC y se
-- guardaba con la fecha de MAÑANA — el Resumen del día la perdía por
-- completo, aunque la operación sí existiera.

alter table divisas.operations
  alter column operation_date set default ((now() at time zone 'America/Mexico_City')::date),
  alter column operation_time set default ((now() at time zone 'America/Mexico_City')::time);
