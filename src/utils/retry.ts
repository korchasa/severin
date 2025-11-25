import { log } from "./logger.ts";

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  factor?: number;
  /** Operation name for logging */
  opName?: string;
}

/**
 * Retries a function with exponential backoff.
 *
 * @param fn - The async function to retry.
 * @param options - Retry configuration.
 * @returns The result of the function.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const factor = options.factor ?? 2;
  const opName = options.opName ?? "operation";

  let lastError: unknown;
  let delay = initialDelayMs;

  // Loop for initial attempt (0) and retries (1..maxRetries)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If this was the last attempt, stop
      if (attempt === maxRetries) {
        break;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);

      log({
        mod: "retry",
        level: "warn",
        event: "retry_attempt",
        op: opName,
        attempt: attempt + 1, // Retry number (1-based)
        maxRetries,
        delayMs: delay,
        error: errorMessage,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= factor;
    }
  }

  // If we are here, all attempts failed.
  log({
    mod: "retry",
    level: "error",
    event: "retry_failed",
    op: opName,
    attempts: maxRetries + 1,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });

  throw lastError;
}
