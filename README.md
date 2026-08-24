# EA Divisas — Operations

Sistema interno de EA Divisas para registrar, calcular y auditar operaciones de **transferencias internacionales**, **criptomonedas** y **efectivo/dólares**.

**Producción:** https://ea-divisas-operations.netlify.app
**Repositorio local:** `C:\Users\ergog\ea-divisas`

---

## Arquitectura

```
Navegador (React/Vite)  ──RLS──▶  Supabase (Postgres + Auth)
        │                              ▲
        │ JWT del usuario              │ service role key (nunca en el navegador)
        ▼                              │
Netlify Function (create-operation) ───┘
        │
        └─▶ motor de cálculo (src/lib/calc-engine) — única fuente de verdad
             para toda fórmula financiera del sistema
```

- **Frontend**: React + TypeScript + Vite. Lee datos directo de Supabase (protegido por RLS). TanStack Query para fetch/caché, Recharts para gráficas, React Router para navegación.
- **Backend privilegiado**: una sola Netlify Function (`netlify/functions/create-operation.ts`). Es la **única** forma de crear una operación — RLS bloquea el `INSERT` directo en `operations` para todos los roles a propósito. La función verifica el JWT y el rol del usuario, corre el motor de cálculo sobre los insumos crudos (nunca confía en un total pre-calculado del navegador), y persiste todo en una transacción vía funciones SQL `SECURITY DEFINER`.
- **Motor de cálculo** (`src/lib/calc-engine/`): aritmética decimal exacta (`decimal.js`, nunca floats de JS para dinero), con desglose auditable de cómo se obtiene cada número. Un solo módulo, importado tanto por el frontend (preview en vivo) como por la Netlify Function (cálculo autoritativo). 18 pruebas automáticas (`npm test`).
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

Row Level Security activo en las 19 tablas de negocio (`supabase/migrations/015_rls_policies.sql`). Punto clave de diseño: **nadie tiene permiso de INSERT directo en `operations`** — ni siquiera vía RLS — porque crear una operación implica recalcular con el motor de cálculo del servidor. La única vía es la Netlify Function con la service role key.

Cambio de estado controlado por la función `divisas.update_operation_status()` (SQL, `SECURITY DEFINER`), que valida la transición contra la misma máquina de estados que usa el frontend (`src/lib/domain/operation-status.ts` — si cambias una, cambia la otra, están comentadas cruzadamente).

## Variables de entorno

Ver `.env.example`. Nunca commitear `.env` (ya está en `.gitignore`).

```
VITE_SUPABASE_URL              # pública, va al navegador
VITE_SUPABASE_ANON_KEY         # pública (clave anon/publishable), va al navegador
SUPABASE_SERVICE_ROLE_KEY      # SECRETA — solo Netlify Functions, nunca el navegador
SUPABASE_PROJECT_REF           # solo para scripts/migrate.mjs
SUPABASE_ACCESS_TOKEN          # personal access token, solo para scripts/migrate.mjs (nunca en producción)
```

En Netlify, las variables ya están configuradas (`netlify env:list` para verlas). `SUPABASE_SERVICE_ROLE_KEY` está marcada como secreta y solo en el contexto de producción.

## Autenticación

Supabase Auth (email + password). El primer usuario (`super_admin`) ya existe:

- **Usuario**: `i55969072@gmail.com`
- Cámbiale la contraseña desde el dashboard de Supabase (Authentication → Users) o agrega un flujo de "cambiar contraseña" en la app.

Nuevos usuarios se crean con `role = 'operador'` por defecto (trigger `divisas.handle_new_user`); un `super_admin` sube el rol desde **Usuarios** en la app.

## Cálculos

Cada módulo tiene su propia fórmula (no se asume que todas las operaciones funcionan igual):

- **Transferencias**: `monto recibido = enviado × tipo de cambio de venta`; `spread = recibido − (enviado × tipo de cambio de compra)`; comisión fija/porcentual aparte; `utilidad neta = spread + comisión − costos operativos`.
- **Cripto**: precio de mercado, de compra y de venta **siempre separados**; comisión de exchange (compra y venta por separado), comisión de red, y comisión al cliente **nunca se mezclan**; `utilidad neta = ingreso total − costo de adquisición − comisión exchange (venta) − comisión de red − otros costos`.
- **Efectivo**: `spread = precio de venta − precio de compra`; `utilidad = cantidad × spread + comisión − costos adicionales`.

Todo en `NUMERIC` de Postgres y `decimal.js` en TypeScript — nunca floats de JS para dinero. Pruebas: `npm test` (18 casos, cubre transferencia simple/con comisión/con spread, efectivo, cripto con trading fee/network fee/spread, y conciliación).

## Desarrollo local

```bash
npm install
cp .env.example .env   # y llena los valores
npm run dev             # frontend (Vite)
npm test                # motor de cálculo
npm run typecheck:functions   # type-check de las Netlify Functions
npx tsx scripts/smoke-test-create-operation.mts <password>   # prueba end-to-end contra la base real
```

Para probar las Netlify Functions localmente (con las variables de servidor): `npx netlify dev`.

## Despliegue

Ya desplegado en Netlify (`ea-divisas-operations`, cuenta Ziata). Redeploy:

```bash
npx netlify-cli deploy --prod --build
```

## Qué falta / próximos pasos

Este sistema es funcional de punta a punta (auth, RLS, motor de cálculo, los 3 módulos, dashboard, clientes, tipos de cambio, proveedores, comisiones, conciliación, reportes con exportación, auditoría, usuarios) pero hay áreas para seguir puliendo:

- **Diseño visual**: el sistema de diseño (negro/marino/azul eléctrico, cards, tablas) está aplicado consistentemente y es responsivo (celular/tablet/escritorio), pero no se ha revisado en un navegador real con Chrome DevTools conectado — vale la pena un pase visual.
- **Métricas de dashboard más finas por módulo** (spread generado y fees desglosados para cripto, USD comprados vs. vendidos para efectivo) — hoy el dashboard usa las vistas agregadas globales; se puede añadir una vista SQL dedicada si se necesita ese nivel de detalle.
- **PDF real**: el botón "PDF" usa impresión del navegador (`window.print()`); si se necesita un PDF generado del lado servidor con diseño propio, se puede añadir una librería dedicada.

### Ya resuelto (antes estaba aquí como pendiente)

- **Comprobantes**: bucket privado de Supabase Storage (`attachments`, 15MB por archivo) con políticas RLS calcadas de la tabla `attachments`. Botón "Detalle" en cada operación abre subir/ver/borrar comprobantes (URLs firmadas, nunca públicas).
- **Editar una operación ya creada**: mismo botón "Detalle" — `super_admin`/`admin` ven el formulario pre-llenado y editable (recalcula con el mismo motor de cálculo antes de guardar); `operador`/`auditor` lo ven en solo lectura. Cambios quedan en `audit_logs` automáticamente (mismos triggers que la creación).
