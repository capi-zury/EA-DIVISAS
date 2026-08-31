/**
 * Validación de entrada para los endpoints privilegiados (src/lib/server).
 * Sanitiza/tipa lo que llega del navegador antes de tocarlo — nunca se
 * confía en un campo "ya calculado" que venga del cliente; los montos
 * financieros SIEMPRE se recalculan con el motor de cálculo, esto solo
 * valida los insumos.
 */
import { z } from 'zod';

const money = z.union([z.number().finite(), z.string().min(1)]);
const uuid = z.string().uuid();
const optionalUuid = uuid.optional().nullable();

export const operationHeaderSchema = z.object({
  client_id: optionalUuid,
  provider_id: optionalUuid,
  executed_by: optionalUuid,
  authorized_by: optionalUuid,
  payment_method: z.string().max(60).optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
  observations: z.string().max(2000).optional().nullable(),
  status: z
    .enum(['cotizacion', 'pendiente', 'en_proceso', 'enviada', 'completada', 'cancelada', 'reembolsada', 'con_incidencia'])
    .optional(),
  is_demo: z.boolean().optional(),
});

export const transferInputSchema = z.object({
  contactPhone: z.string().max(40).optional().nullable(),
  countryOrigin: z.string().min(1).max(80),
  countryDestination: z.string().min(1).max(80),
  currencyOrigin: z.string().min(3).max(3),
  currencyDestination: z.string().min(3).max(3),
  amountSent: money,
  buyRate: money,
  sellRate: money,
  commissionFixed: money.optional(),
  commissionPercent: money.optional(),
  providerCost: money.optional(),
  bankCost: money.optional(),
  additionalCost: money.optional(),
  expectedAmount: money.optional(),
  actualAmount: money.optional(),
});

export const cryptoInputSchema = z.object({
  cryptoAssetCode: z.string().min(2).max(12),
  cryptoNetworkId: uuid,
  txHash: z.string().max(200).optional().nullable(),
  walletOriginAddress: z.string().max(200).optional().nullable(),
  walletDestinationAddress: z.string().max(200).optional().nullable(),
  walletOriginId: optionalUuid,
  walletDestinationId: optionalUuid,
  quantity: money,
  marketPrice: money,
  buyPrice: money,
  sellPrice: money,
  fxRateMxnUsd: money.optional(),
  providerFeeBuy: money.optional(),
  providerFeeSell: money.optional(),
  networkFee: money.optional(),
  customerFeeFixed: money.optional(),
  customerFeePercent: money.optional(),
});

export const cashInputSchema = z.object({
  currencyCode: z.string().min(3).max(3),
  denomination: z.string().max(60).optional().nullable(),
  quantity: money,
  buyPrice: money,
  sellPrice: money,
  exchangeRateReference: money.optional(),
  commissionFixed: money.optional(),
  commissionPercent: money.optional(),
  additionalCosts: money.optional(),
  providerId: optionalUuid,
  providerCommissionPercent: money.optional(),
});

// ---------- Importación de transferencias (endpoint import-operations) ----------
// Las filas llegan tal cual salieron del Excel/CSV o del Google Sheet — objetos
// {encabezado: valor}. La normalización y validación real vive en
// src/lib/import/transfer-import.ts (compartida con el frontend); esto solo
// acota el sobre.

export const importOperationsRequestSchema = z.object({
  source: z.enum(['excel', 'google_sheet', 'drive_xlsx']),
  /** Continúa una importación ya empezada (chunks). Si falta, se crea un lote nuevo. */
  batchId: uuid.optional(),
  fileName: z.string().max(300).optional().nullable(),
  sheetId: z.string().max(200).optional().nullable(),
  /** campo canónico → encabezado de columna. Si falta, se auto-detecta por los encabezados. */
  mapping: z.record(z.string(), z.string()).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).max(1000),
  dryRun: z.boolean().optional(),
  isScheduled: z.boolean().optional(),
  countryOrigin: z.string().max(80).optional(),
  countryDestination: z.string().max(80).optional(),
  /** Estado para las filas cuya columna STATUS viene vacía. Por defecto 'completada'. */
  defaultStatus: z
    .enum(['cotizacion', 'pendiente', 'en_proceso', 'enviada', 'completada', 'cancelada', 'reembolsada', 'con_incidencia'])
    .optional(),
});

export type ImportOperationsRequest = z.infer<typeof importOperationsRequestSchema>;

export const createOperationRequestSchema = z.discriminatedUnion('module', [
  z.object({ module: z.literal('transferencia'), header: operationHeaderSchema, details: transferInputSchema }),
  z.object({ module: z.literal('cripto'), header: operationHeaderSchema, details: cryptoInputSchema }),
  z.object({ module: z.literal('efectivo'), header: operationHeaderSchema, details: cashInputSchema }),
]);

export type CreateOperationRequest = z.infer<typeof createOperationRequestSchema>;

// ---------- Alta de usuarios (endpoint admin-users) ----------

export const userRoleSchema = z.enum(['super_admin', 'admin', 'operador', 'auditor']);

export const createUserRequestSchema = z.object({
  full_name: z.string().trim().min(2, 'El nombre es obligatorio.').max(120),
  email: z.string().trim().toLowerCase().email('Correo inválido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(72),
  role: userRoleSchema,
});

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
