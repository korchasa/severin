/**
 * Configuration and environment variable validation
 */
import type { Config } from "./types.ts";
import { env, envNumberOptional, parseOwnerIds } from "./utils.ts";
export type { Config };

/**
 * Creates default configuration instance using environment variables
 * This function is called by the loader to build the configuration
 * @param systemInfo - Optional system information to include in system prompt
 * @returns Default configuration with environment overrides
 */
export function createDefaultConfig(systemInfo?: string): Config {
  return {
    // Agent settings - core functionality configuration
    agent: {
      // Directory for storing agent data (logs, history, etc.)
      dataDir: env("AGENT_DATA_DIR", "./data"),
      // History management settings
      history: {
        // Maximum total symbols to keep in conversation history
        maxSymbols: env("AGENT_MEMORY_MAX_SYMBOLS", 20000),
      },
      // Terminal execution settings
      terminal: {
        // Timeout for terminal execution in milliseconds
        timeoutMs: env("AGENT_TERMINAL_TIMEOUT_MS", 30_000),
        // Maximum output size from terminal in bytes
        maxCommandOutputSize: env("AGENT_TERMINAL_MAX_COMMAND_OUTPUT_SIZE", 200_000),
        // Maximum length of input to process for LLM
        maxLLMInputLength: env("AGENT_TERMINAL_MAX_LLM_INPUT_LENGTH", 2000),
      },
      // LLM configuration
      llm: {
        // LLM provider (e.g., "openai", "anthropic")
        provider: env("AGENT_LLM_PROVIDER", "openai"),
        // Temperature for LLM
        temperature: env("AGENT_LLM_TEMPERATURE", 0),
        // API key for LLM provider (required)
        apiKey: env("AGENT_LLM_API_KEY"), // Required, no default
        // Model name to use
        model: env("AGENT_LLM_MODEL", "gpt-5-mini"),
        // Maximum number of reasoning steps
        maxSteps: env("AGENT_LLM_MAX_STEPS", 30),
        // Maximum length of stdout output to process
        maxStdoutLength: env("AGENT_LLM_MAX_STDOUT_LENGTH", 2000),
        // Base prompt template
        basePrompt:
          "You are a home server agent. Your goal is to help users with server management tasks with the tools provided. You must use clear and concise language.",
        // System information for LLM context
        systemInfo,
        // Token prices in USD per 1M tokens
        tokenPrices: {
          inputTokens: env("AGENT_LLM_PRICE_INPUT_TOKENS", 0.15), // $0.15 per 1M input tokens
          outputTokens: env("AGENT_LLM_PRICE_OUTPUT_TOKENS", 0.60), // $0.60 per 1M output tokens
          totalTokens: envNumberOptional("AGENT_LLM_PRICE_TOTAL_TOKENS"), // Optional total token price
          reasoningTokens: envNumberOptional("AGENT_LLM_PRICE_REASONING_TOKENS"), // Optional reasoning token price
          cachedInputTokens: envNumberOptional("AGENT_LLM_PRICE_CACHED_INPUT_TOKENS"), // Optional cached input token price
        },
      },
    },
    // Telegram bot configuration
    telegram: {
      // Bot token from BotFather (required)
      botToken: env("TELEGRAM_BOT_TOKEN"), // Required, no default
      // Comma-separated list of owner Telegram IDs (required)
      ownerIds: parseOwnerIds(env("TELEGRAM_OWNER_IDS")), // Required, no default
    },
    // Logging configuration
    logging: {
      // Log format: "pretty" for development, "json" for production
      format: env("LOGGING_FORMAT", "pretty") as "pretty" | "json",
    },
    // Scheduled tasks configuration
    scheduler: {
      // Interval between health checks in hours
      intervalHours: env("SCHEDULER_INTERVAL_HOURS", 1),
      // Random jitter to avoid synchronized checks in minutes
      jitterMinutes: env("SCHEDULER_JITTER_MINUTES", 5),
    },
    // Metrics configuration
    metrics: {
      // How long to keep metrics history in hours
      historyHours: env("AGENT_METRICS_HISTORY_HOURS", 1),
      // Percentage threshold for significant changes
      changeThreshold: env("AGENT_METRICS_CHANGE_THRESHOLD", 10),
      // Minutes to look back for comparison (5 min, 30 min)
      comparisonMinutes: [5, 30],
      // Delay between collecting sensitive metrics to prevent interference
      sensitiveCollectionDelayMs: env("AGENT_METRICS_SENSITIVE_COLLECTION_DELAY_MS", 3000),
    },
  };
}

/**
 * Default configuration instance - legacy export for backwards compatibility
 * @deprecated Use createDefaultConfig() instead
 */
export function getDefaultConfig(systemInfo?: string): Config {
  return createDefaultConfig(systemInfo);
}
