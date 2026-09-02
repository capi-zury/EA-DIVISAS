# EA Divisas — Operations

Sistema interno de EA Divisas para registrar, calcular y auditar operaciones de **transferencias internacionales**, **criptomonedas** y **efectivo/dólares**.

**Producción:** pantalla en GitHub Pages · endpoints en Supabase Edge Functions · datos en Supabase.
**Repositorio local:** `C:\Users\i5596\EA-DIVISAS`

---

## Arquitectura

```
Navegador (React/Vite, GitHub Pages)  ──RLS──▶  Supabase (Postgres + Auth)
        │                                          ▲
        │ JWT del usuario                          │ service role key (nunca en el navegador)
        ▼                                          │
Supabase Edge Function (create-operation, …) ──────┘
        │
        └─▶ motor de cálculo (src/lib/calc-engine) — única fuente de verdad
             para toda fórmula financiera del sistema
```

- **Frontend**: React + TypeScript + Vite, servido como estático desde **GitHub Pages** (workflow en `.github/workflows/deploy-pages.yml`). Ruteo por hash (`#/...`) para funcionar en un subpath sin configuración de servidor. Lee datos directo de Supabase (protegido por RLS). TanStack Query para fetch/caché, Recharts para gráficas.
- **Backend privilegiado**: 3 **Supabase Edge Functions** (`supabase/functions/`): `create-operation`, `admin-users`, `import-operations`. Crear una operación es la **única** vía — RLS bloquea el `INSERT` directo en `operations` para todos los roles a propósito. La función verifica el JWT y el rol del usuario, corre el motor de cálculo sobre los insumos crudos (nunca confía en un total pre-calculado del navegador), y persiste todo en una transacción vía funciones SQL `SECURITY DEFINER`.
- **Lógica de los endpoints**: `src/lib/server/` (`handle*(req) → res`, agnóstica de plataforma). Las Edge Functions en `supabase/functions/<name>/index.ts` son adaptadores de 3 líneas (`Deno.serve` + CORS). Así la lógica no queda atada a un proveedor de hosting.
- **Motor de cálculo** (`src/lib/calc-engine/`): aritmética decimal exacta (`decimal.js`, nunca floats de JS para dinero), con desglose auditable de cómo se obtiene cada número. Un solo módulo, importado tanto por el frontend (preview en vivo) como por las Edge Functions (cálculo autoritativo). 18 pruebas automáticas (`npm test`).
- **Base de datos**: Supabase Postgres, schema propio `divisas` (separado de `public`, donde vive una app personal de cripto no relacionada de una sesión anterior — nunca se tocó).

## Base de datos

21 tablas + 4 vistas en el schema `divisas`. Las más importantes:

| Tabla | Qué guarda |
|---|---|
| `operations` | Cabecera común a los 3 módulos: folio, cliente, quién creó/ejecutó/autorizó, estado, resumen financiero (snapshot calculado) |
| `international_transfers` / `crypto_transactions` / `cash_transactions` | Extensión 1:1 de `operations` con los campos específicos de cada módulo |
| `exchange_rates` + `exchange_rate_history` | Tipo de cambio actual editable + historial append-only de cada cambio |
| `commission_rules` + `fees` | Configuración de comisiones (ingreso) y costos externos (proveedor/red) — solo sugieren default, cada operación guarda su propio valor |
| `audit_logs` | Bitácora append-only — nadie puede editar/borrar un registro, ni siquiera super_admin |
| `operation_status_history` | Línea de tiempo de cambios de estado de cada operación |
| `reconciliations` | Esperado vs. real, con diferencia calculada automáticamente |
| `profiles` | Extiende `auth.users` de Supabase — el rol vive aquí |

Migraciones en `supabase/migrations/*.sql`, numeradas y aplicadas en orden por `scripts/migrate.mjs` (usa la Management API de Supabase, no necesita `psql`). Para aplicar migraciones nuevas:

```bash
node scripts/migrate.mjs
```

Seed de catálogo (monedas/criptos/redes — no son datos de prueba, son mínimos para que la app funcione) en `018_seed_reference_data.sql`, ya aplicado. Datos **DEMO** (operaciones ficticias para desarrollo) viven aparte en `supabase/seed/demo_data.sql`, fuera de `migrations/` a propósito para que nunca se auto-apliquen — se marcan `is_demo: true` y las vistas de dashboard los excluyen siempre.

## Roles y permisos (RLS)

| Rol | Puede |
|---|---|
| `super_admin` | Todo: ver/editar todo, administrar usuarios, tipos de cambio, comisiones, ver auditoría, corregir/cancelar operaciones |
| `admin` | Igual que super_admin excepto gestionar usuarios |
| `operador` | Crear operaciones (vía la Netlify Function), consultar clientes/tipos de cambio, cambiar estado dentro del flujo normal (no puede cancelar/reembolsar ni corregir cifras) |
| `auditor` | Solo lectura de operaciones y auditoría |

Row Level Security activo en las 19 tablas de negocio (`supabase/migrations/015_rls_policies.sql`). Punto clave de diseño: **nadie tiene permiso de INSERT directo en `operations`** — ni siquiera vía RLS — porque crear una operación implica recalcular con el motor de cálculo del servidor. La única vía es la Edge Function con la service role key.

Cambio de estado controlado por la función `divisas.update_operation_status()` (SQL, `SECURITY DEFINER`), que valida la transición contra la misma máquina de estados que usa el frontend (`src/lib/domain/operation-status.ts` — si cambias una, cambia la otra, están comentadas cruzadamente).

## Variables de entorno

Ver `.env.example`. Nunca commitear `.env` (ya está en `.gitignore`).

```
VITE_SUPABASE_URL              # pública, va al navegador (build de Vite)
VITE_SUPABASE_ANON_KEY         # pública (clave anon/publishable), va al navegador
SUPABASE_SERVICE_ROLE_KEY      # SECRETA — solo servidor. Supabase la inyecta sola en las Edge Functions
SUPABASE_URL                   # para las Edge Functions (Supabase también la inyecta sola)
SUPABASE_PROJECT_REF           # solo para scripts/migrate.mjs
SUPABASE_ACCESS_TOKEN          # personal access token (sbp_...), para migrate.mjs y `supabase functions deploy`
DATABASE_URL                   # solo local, para migrate.mjs / apply-migration-030.mjs
```

- **Pantalla (GitHub Pages)**: las `VITE_*` se hornean en el build. El workflow de Actions las toma de los *repository secrets* `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- **Edge Functions**: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las provee Supabase automáticamente en el runtime — no hay que configurarlas.

## Autenticación

Supabase Auth (email + password). El primer usuario (`super_admin`) ya existe:

- **Usuario**: `zkassin@estructuraagil.com`
- Cámbiale la contraseña desde el dashboard de Supabase (Authentication → Users) o agrega un flujo de "cambiar contraseña" en la app.

Usuarios nuevos: un `super_admin` los da de alta directamente desde **Usuarios → "Nuevo usuario"** en la app (correo, contraseña y rol, incluido `super_admin`). Detrás corre la Edge Function `admin-users` con la service role key. Si en cambio alguien se registra por fuera (dashboard de Supabase), el trigger `divisas.handle_new_user` le crea el perfil con `role = 'operador'` y un `super_admin` lo sube.

## Cálculos

Cada módulo tiene su propia fórmula (no se asume que todas las operaciones funcionan igual):

- **Transferencias**: `monto recibido = enviado × tipo de cambio de venta`; `spread = recibido − (enviado × tipo de cambio de compra)`; comisión fija/porcentual aparte; `utilidad neta = spread + comisión − costos operativos`.
- **Cripto**: precio de mercado, de compra y de venta **siempre separados**; comisión de exchange (compra y venta por separado), comisión de red, y comisión al cliente **nunca se mezclan**; `utilidad neta = ingreso total − costo de adquisición − comisión exchange (venta) − comisión de red − otros costos`.
- **Efectivo**: `spread = precio de venta − precio de compra`; `utilidad = cantidad × spread + comisión − costos adicionales`.

Todo en `NUMERIC` de Postgres y `decimal.js` en TypeScript — nunca floats de JS para dinero. Pruebas: `npm test` (18 casos, cubre transferencia simple/con comisión/con spread, efectivo, cripto con trading fee/network fee/spread, y conciliación).

## Importación de transferencias

Sirve para traer al sistema operaciones que el equipo lleva en un Excel/CSV externo (y —Fase 2— en su Google Sheet). **El sistema solo lee la fuente; nunca escribe de vuelta.**

- **Entrada**: botón "Importar de Excel" en la página de Transferencias. Sube `.xlsx`/`.csv`, mapea columnas (se auto-detectan las de la tabla del equipo y el mapeo se guarda en `localStorage`), revisa la vista previa y confirma. Las filas se mandan por lotes de 200 a la Edge Function `import-operations`.
- **Misma vía blindada**: `import-operations` verifica JWT + rol (super_admin/admin/operador), corre el motor de cálculo por fila y crea cada operación con el RPC `divisas.create_transfer_operation`. Cero `INSERT` directo.
- **Modelo de la fila importada**: la tabla del equipo es un registro operativo/compliance (datos bancarios, SWIFT, UETR, status), no una calculadora de margen — trae un solo tipo de cambio y sin comisión. Por eso cada fila se guarda con **principal en USD y sin spread** (`buy_rate = sell_rate = 1`); el TC original y el equivalente en MXN quedan como referencia en `international_transfers.tc_reference` / `amount_mxn`. Migración `030` agrega además `promotor`, `beneficiary_*`, `intermediary_bank`, `bank_address`, `beneficiary_tax_id`, `uetr` y las banderas `flag_alta` / `flag_cuenta_con_recursos` / `flag_factura` / `flag_pago`.
- **"ESTADO DE CUENTA CLIENTES" (una hoja por cliente)**: si el archivo tiene esa pinta, se lee sin asistente de columnas (`src/lib/import/estado-cuenta.ts`) y se sincroniza a diario desde SharePoint (`scripts/sync-estado-cuenta.mts`). **Reglamento de utilidad**: la utilidad de cada pago = **comisión** (columna `COM $`, o `COM %` × TOTAL) **+ spread cambiario**, y el spread — `USD × (TC venta − TC compra)` — solo se suma cuando la hoja trae TC de compra **y** de venta con datos completos. Si falta el TC de compra se iguala al de venta (spread 0) y no se suma nada por diferencia de tipo de cambio; la columna `DIFERENCIA` de la hoja no se usa como fuente porque a menudo viene sin el TC de compra restado.
- **Deduplicación**: `operations.import_key` (UETR de la fila si viene; si no, un hash estable de fecha+cliente+monto+beneficiario), con índice único parcial. Re-importar el mismo archivo/Sheet no duplica — las filas ya existentes se marcan "omitida".
- **Cliente**: se busca por nombre normalizado; si no existe, se crea automáticamente (`notes = 'Alta automática por importación de transferencias.'`).
- **Bitácora**: cada corrida deja una fila en `divisas.import_batches` (fuente, archivo, contadores, y `results` fila por fila). El detalle por fila también es descargable como CSV al terminar.
- **Lógica compartida** frontend/servidor en `src/lib/import/transfer-import.ts` (parseo tolerante de números/fechas, mapeo de STATUS al enum de la app, hash de deduplicación), con pruebas en `transfer-import.test.ts`.

Pendiente (Fase 2): job programado + botón que leen el Google Sheet del equipo con una cuenta de servicio de Google (solo lectura) y los pasan por el mismo pipeline; pantalla "Importaciones". Fase 3: carpeta de Drive con `.xlsx`.

## Desarrollo local

```bash
npm install
cp .env.example .env   # y llena los valores
npm run dev             # frontend (Vite)
npm test                # motor de cálculo + normalizador de importación
npm run typecheck:server # type-check de la lógica de los endpoints (src/lib/server)
npx tsx scripts/smoke-test-create-operation.mts <password>   # prueba end-to-end contra la base real
```

Para probar las Edge Functions localmente: `npx supabase functions serve` (requiere Docker).

## Despliegue

**Pantalla (GitHub Pages)** — automático: cada `git push` a `main` dispara `.github/workflows/deploy-pages.yml`, que compila y publica. Setup una sola vez: en el repo, *Settings → Pages → Source: GitHub Actions*, y agregar los secrets `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

**Endpoints (Supabase Edge Functions)** — manual:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...        # Account → Access Tokens en Supabase
npm run functions:deploy                    # despliega create-operation, admin-users, import-operations
# o una sola:  npx supabase functions deploy import-operations --project-ref cwyrsqhoqieaamfgbuyb
```

**Base de datos** — `node scripts/migrate.mjs` (necesita `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`).

## Qué falta / próximos pasos

Este sistema es funcional de punta a punta (auth, RLS, motor de cálculo, los 3 módulos, dashboard, clientes, tipos de cambio, proveedores, comisiones, conciliación, reportes con exportación, auditoría, usuarios) pero hay áreas para seguir puliendo:

- **Diseño visual**: el sistema de diseño (negro/marino/azul eléctrico, cards, tablas) está aplicado consistentemente y es responsivo (celular/tablet/escritorio), pero no se ha revisado en un navegador real con Chrome DevTools conectado — vale la pena un pase visual.
- **Métricas de dashboard más finas por módulo** (spread generado y fees desglosados para cripto, USD comprados vs. vendidos para efectivo) — hoy el dashboard usa las vistas agregadas globales; se puede añadir una vista SQL dedicada si se necesita ese nivel de detalle.
- **PDF real**: el botón "PDF" usa impresión del navegador (`window.print()`); si se necesita un PDF generado del lado servidor con diseño propio, se puede añadir una librería dedicada.
- **Importación automática desde Google (Fase 2/3)**: hoy la importación de transferencias es por subida manual de Excel/CSV (ver sección "Importación de transferencias"). Falta el job programado + botón que lean el Google Sheet del equipo con una cuenta de servicio de Google (solo lectura), la pantalla "Importaciones", y —Fase 3— la lectura de una carpeta de Drive con `.xlsx`. Requiere de parte del cliente: cuenta de servicio en Google Cloud, API de Sheets habilitada, y compartir el Sheet/carpeta con ese correo.
- **Márgenes en transferencias importadas**: las filas del import genérico (tabla del equipo, `src/lib/import/transfer-import.ts`) entran con spread 0 porque esa fuente no lleva TC de compra ni comisión — ese sigue siendo el único lugar a tocar si se agregan esas columnas. Las del "ESTADO DE CUENTA CLIENTES" **sí** calculan la utilidad real (comisión + spread solo con TC completos — ver "Importación de transferencias").

### Ya resuelto (antes estaba aquí como pendiente)

- **Comprobantes**: bucket privado de Supabase Storage (`attachments`, 15MB por archivo) con políticas RLS calcadas de la tabla `attachments`. Botón "Detalle" en cada operación abre subir/ver/borrar comprobantes (URLs firmadas, nunca públicas).
- **Editar una operación ya creada**: mismo botón "Detalle" — `super_admin`/`admin` ven el formulario pre-llenado y editable (recalcula con el mismo motor de cálculo antes de guardar); `operador`/`auditor` lo ven en solo lectura. Cambios quedan en `audit_logs` automáticamente (mismos triggers que la creación).

