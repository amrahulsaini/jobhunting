/**
 * Gemini list prices, USD per 1,000,000 tokens.
 * Source: https://ai.google.dev/gemini-api/docs/pricing (checked 2026-08-12).
 *
 * Pro models price a long prompt higher once it passes 200k tokens, so each
 * entry can carry a second tier. Everything here is the *standard* tier — batch
 * and flex are cheaper but have different latency guarantees we don't use.
 *
 * These are our costs. What the user is charged is derived in usage.ts.
 */

export interface ModelPrice {
  /** USD per 1M input tokens, prompts up to the tier threshold. */
  input: number;
  /** USD per 1M output tokens, prompts up to the tier threshold. */
  output: number;
  /** Prompt size at which the higher tier kicks in. */
  tierThreshold?: number;
  /** USD per 1M input tokens above the threshold. */
  inputAbove?: number;
  /** USD per 1M output tokens above the threshold. */
  outputAbove?: number;
}

export const PRICES: Record<string, ModelPrice> = {
  "gemini-3.1-pro-preview": {
    input: 2.0, output: 12.0, tierThreshold: 200_000, inputAbove: 4.0, outputAbove: 18.0,
  },
  "gemini-2.5-pro": {
    input: 1.25, output: 10.0, tierThreshold: 200_000, inputAbove: 2.5, outputAbove: 15.0,
  },
  "gemini-3.6-flash": { input: 1.5, output: 7.5 },
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3-flash-preview": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
};

/** Unknown models fall back to our most expensive tier so we never under-bill. */
const FALLBACK: ModelPrice = PRICES["gemini-3.1-pro-preview"];

export function priceFor(model: string): ModelPrice {
  return PRICES[model] ?? PRICES[model.replace(/-\d{2}-\d{4}$/, "")] ?? FALLBACK;
}

/** Our raw cost in USD for one call. */
export function rawCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  const overTier = p.tierThreshold != null && inputTokens > p.tierThreshold;

  const inputRate = overTier && p.inputAbove != null ? p.inputAbove : p.input;
  const outputRate = overTier && p.outputAbove != null ? p.outputAbove : p.output;

  return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
}

/** What the user is charged: our cost, marked up. */
export const MARKUP = Number(process.env.HUNTER_USAGE_MARKUP ?? 3);

export function chargedCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  return rawCostUsd(model, inputTokens, outputTokens) * MARKUP;
}
