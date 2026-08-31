/**
 * Punto único de entrada al motor de cálculo. Frontend (preview en vivo) y
 * backend (Netlify Functions, cálculo autoritativo antes de persistir) deben
 * importar SIEMPRE desde aquí — nunca reimplementar una fórmula en un
 * componente o endpoint distinto.
 */
export * from './money.ts';
export * from './transfers.ts';
export * from './crypto.ts';
export * from './cash.ts';
export * from './reconciliation.ts';
