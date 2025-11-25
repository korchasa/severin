import { assertEquals, assertRejects } from "@std/assert";
import { withRetry } from "./retry.ts";

Deno.test("withRetry succeeds on first try", async () => {
  let attempts = 0;
  const result = await withRetry(() => {
    attempts++;
    return Promise.resolve("success");
  });

  assertEquals(result, "success");
  assertEquals(attempts, 1);
});

Deno.test("withRetry succeeds after retries", async () => {
  let attempts = 0;
  const result = await withRetry(
    () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("fail");
      }
      return Promise.resolve("success");
    },
    { initialDelayMs: 10 }, // Fast for test
  );

  assertEquals(result, "success");
  assertEquals(attempts, 3);
});

Deno.test("withRetry fails after max retries", async () => {
  let attempts = 0;
  await assertRejects(
    async () => {
      await withRetry(
        () => {
          attempts++;
          throw new Error("fail");
        },
        { maxRetries: 3, initialDelayMs: 10 },
      );
    },
    Error,
    "fail",
  );
  assertEquals(attempts, 4); // Initial + 3 retries
});
