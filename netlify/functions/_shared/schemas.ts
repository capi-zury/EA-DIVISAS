/**
 * Validación de entrada para las Netlify Functions. Sanitiza/tipa lo que
 * llega del navegador antes de tocarlo — nunca se confía en un campo
 * "ya calculado" que venga del cliente; los montos financieros SIEMPRE se
 * recalculan aquí con el motor de cálculo, esto solo valida los insumos.
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

export const createOperationRequestSchema = z.discriminatedUnion('module', [
  z.object({ module: z.literal('transferencia'), header: operationHeaderSchema, details: transferInputSchema }),
  z.object({ module: z.literal('cripto'), header: operationHeaderSchema, details: cryptoInputSchema }),
  z.object({ module: z.literal('efectivo'), header: operationHeaderSchema, details: cashInputSchema }),
]);

export type CreateOperationRequest = z.infer<typeof createOperationRequestSchema>;
