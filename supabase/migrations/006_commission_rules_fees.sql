-- 006: reglas de comisión (lado ingreso, lo que cobramos) y fees (lado
-- costo, lo que nos cobran proveedores/red). Deliberadamente separadas:
-- una comisión y un costo externo nunca deben mezclarse en el mismo campo.
--
-- IMPORTANTE: estas tablas son la CONFIGURACIÓN por defecto que se sugiere
-- al crear una operación nueva. Cada operación copia (snapshot) los valores
-- al momento de crearse — cambiar una regla aquí no recalcula operaciones
-- pasadas.

create table if not exists divisas.commission_rules (
  id uuid primary key default gen_random_uuid(),
  module divisas.operation_module not null,
  scope text,                          -- código de moneda/cripto/proveedor al que aplica; null = default general del módulo
  kind divisas.commission_kind not null default 'porcentual',
  fixed_amount numeric(18,4) not null default 0,
  percent numeric(9,4) not null default 0,     -- 0.6000 = 0.6%
  default_spread numeric(18,8) not null default 0,
  active boolean not null default true,
  created_by uuid references divisas.profiles(id),
  updated_by uuid references divisas.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists divisas.fees (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references divisas.providers(id),
  crypto_asset_code text references divisas.crypto_assets(code),
  crypto_network_id uuid references divisas.crypto_networks(id),
  fee_kind text not null,              -- 'trading' | 'network' | 'bancario' | 'otro'
  amount_fixed numeric(18,8) not null default 0,
  amount_percent numeric(9,4) not null default 0,
  currency_code text references divisas.currencies(code),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commission_rules_module_scope_idx on divisas.commission_rules (module, scope) where active;
create index if not exists fees_provider_idx on divisas.fees (provider_id) where active;

comment on table divisas.commission_rules is 'Reglas de comisión configurables por módulo/scope. Solo sugieren valores por defecto al crear una operación; el valor real usado queda grabado en la operación.';
comment on table divisas.fees is 'Costos externos configurables (comisión de proveedor/exchange, comisión de red, costo bancario). Igual que commission_rules: solo default, cada operación guarda su propio valor.';

drop trigger if exists commission_rules_audit on divisas.commission_rules;
create trigger commission_rules_audit
  after insert or update or delete on divisas.commission_rules
  for each row execute function divisas.audit_row_change();

drop trigger if exists fees_audit on divisas.fees;
create trigger fees_audit
  after insert or update or delete on divisas.fees
  for each row execute function divisas.audit_row_change();
