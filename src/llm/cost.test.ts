import { assertEquals } from "@std/assert";
import { calcPrice, sumUsages } from "./cost.ts";

Deno.test("calcPrice calculates cost for basic usage", () => {
  const tokenPrices = {
    inputTokens: 0.15,
    outputTokens: 0.60,
    totalTokens: undefined,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
  };

  const usage = {
    inputTokens: 1000,
    outputTokens: 200,
    totalTokens: undefined,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
  };

  const cost = calcPrice(usage, tokenPrices);

  // Expected: (1000 / 1_000_000) * 0.15 + (200 / 1_000_000) * 0.60
  // = 0.00015 + 0.00012 = 0.00027
  assertEquals(cost, 0.00027);
});

Deno.test("calcPrice calculates cost with all token types", () => {
  const tokenPrices = {
    inputTokens: 0.15,
    outputTokens: 0.60,
    totalTokens: 0.30,
    reasoningTokens: 0.50,
    cachedInputTokens: 0.10,
  };

  const usage = {
    inputTokens: 1000,
    outputTokens: 200,
    totalTokens: 1200,
    reasoningTokens: 100,
    cachedInputTokens: 500,
  };

  const cost = calcPrice(usage, tokenPrices);

  // Expected: (1000 / 1_000_000) * 0.15 + (200 / 1_000_000) * 0.60 + (1200 / 1_000_000) * 0.30 +
  //           (100 / 1_000_000) * 0.50 + (500 / 1_000_000) * 0.10
  // = 0.00015 + 0.00012 + 0.00036 + 0.00005 + 0.00005 = 0.00073
  assertEquals(cost, 0.00073);
});

Deno.test("calcPrice ignores undefined prices and tokens", () => {
  const tokenPrices = {
    inputTokens: 0.15,
    outputTokens: 0.60,
    totalTokens: undefined,
    reasoningTokens: undefined, // This price is undefined
    cachedInputTokens: undefined,
  };

  const usage = {
    inputTokens: 1000,
    outputTokens: 200,
    totalTokens: undefined,
    reasoningTokens: 100, // This should be ignored as price is undefined
    cachedInputTokens: undefined,
  };

  const cost = calcPrice(usage, tokenPrices);

  // Expected: only input and output tokens
  // (1000 / 1_000_000) * 0.15 + (200 / 1_000_000) * 0.60 = 0.00015 + 0.00012 = 0.00027
  assertEquals(cost, 0.00027);
});

Deno.test("calcPrice returns 0 for empty usage", () => {
  const tokenPrices = {
    inputTokens: 0.15,
    outputTokens: 0.60,
    totalTokens: undefined,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
  };

  const usage = {
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
  };

  const cost = calcPrice(usage, tokenPrices);

  assertEquals(cost, 0);
});

Deno.test("sumUsages sums multiple usage objects", () => {
  const usages = [
    {
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
    },
    {
      inputTokens: 50,
      outputTokens: 75,
      totalTokens: 125,
      reasoningTokens: 25,
      cachedInputTokens: undefined,
    },
    {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
      reasoningTokens: undefined,
      cachedInputTokens: 30,
    },
  ];

  const result = sumUsages(usages);

  assertEquals(result.inputTokens, 150);
  assertEquals(result.outputTokens, 275);
  assertEquals(result.totalTokens, 425);
  assertEquals(result.reasoningTokens, 25);
  assertEquals(result.cachedInputTokens, 30);
});
