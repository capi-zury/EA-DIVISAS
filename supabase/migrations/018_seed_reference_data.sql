-- 018: datos de catálogo/referencia — NO son datos de demo (no son
-- operaciones ni clientes ficticios), son el mínimo necesario para que la
-- app funcione: monedas, criptoactivos y sus redes. Es seguro correr esto
-- también en producción.

insert into divisas.currencies (code, name, symbol, decimals) values
  ('MXN', 'Peso mexicano', '$', 2),
  ('USD', 'Dólar estadounidense', '$', 2),
  ('EUR', 'Euro', '€', 2)
on conflict (code) do nothing;

insert into divisas.crypto_assets (code, name, decimals) values
  ('BTC', 'Bitcoin', 8),
  ('ETH', 'Ethereum', 8),
  ('USDT', 'Tether', 8),
  ('USDC', 'USD Coin', 8)
on conflict (code) do nothing;

insert into divisas.crypto_networks (crypto_asset_code, network_name) values
  ('BTC', 'Bitcoin'),
  ('ETH', 'Ethereum'),
  ('USDT', 'Ethereum'),
  ('USDT', 'Tron'),
  ('USDT', 'Polygon'),
  ('USDT', 'Solana'),
  ('USDC', 'Ethereum'),
  ('USDC', 'Polygon'),
  ('USDC', 'Solana')
on conflict (crypto_asset_code, network_name) do nothing;
