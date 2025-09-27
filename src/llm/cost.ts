import type { LanguageModelV2Usage } from "@ai-sdk/provider";
import type { TokenPrices } from "../config/types.ts";

/**
 * Calculates the total cost in USD for the given token usage based on token prices.
 * Uses prices in USD per 1M tokens.
 *
 * @param usage - Token usage statistics from LLM call
 * @param tokenPrices - Token prices configuration
 * @returns Total cost in USD (number)
 */
export function calcPrice(usage: LanguageModelV2Usage, tokenPrices: TokenPrices): number {
  let totalCost = 0;

  // Calculate cost for input tokens (per 1M tokens)
  if (usage.inputTokens && tokenPrices.inputTokens) {
    totalCost += (usage.inputTokens / 1_000_000) * tokenPrices.inputTokens;
  }

  // Calculate cost for output tokens (per 1M tokens)
  if (usage.outputTokens && tokenPrices.outputTokens) {
    totalCost += (usage.outputTokens / 1_000_000) * tokenPrices.outputTokens;
  }

  // Calculate cost for total tokens if provided and configured
  if (usage.totalTokens && tokenPrices.totalTokens) {
    totalCost += (usage.totalTokens / 1_000_000) * tokenPrices.totalTokens;
  }

  // Calculate cost for reasoning tokens if provided and configured
  if (usage.reasoningTokens && tokenPrices.reasoningTokens) {
    totalCost += (usage.reasoningTokens / 1_000_000) * tokenPrices.reasoningTokens;
  }

  // Calculate cost for cached input tokens if provided and configured
  if (usage.cachedInputTokens && tokenPrices.cachedInputTokens) {
    totalCost += (usage.cachedInputTokens / 1_000_000) * tokenPrices.cachedInputTokens;
  }

  return totalCost;
}

export function sumUsages(vals: LanguageModelV2Usage[]): LanguageModelV2Usage {
  const result = vals.reduce(
    (acc, val) => ({
      inputTokens: (acc.inputTokens ?? 0) + (val.inputTokens ?? 0),
      outputTokens: (acc.outputTokens ?? 0) + (val.outputTokens ?? 0),
      totalTokens: (acc.totalTokens ?? 0) + (val.totalTokens ?? 0),
      reasoningTokens: (acc.reasoningTokens ?? 0) + (val.reasoningTokens ?? 0),
      cachedInputTokens: (acc.cachedInputTokens ?? 0) + (val.cachedInputTokens ?? 0),
    }),
    {} as LanguageModelV2Usage,
  );

  return result;
}
