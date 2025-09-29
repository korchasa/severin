/**
 * Configuration type definitions
 */
import { z } from "zod";

/**
 * Domain-specific configuration sections
 */
export interface TokenPrices {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens?: number;
  readonly reasoningTokens?: number;
  readonly cachedInputTokens?: number;
}

export interface LlmConfig {
  readonly provider: string;
  readonly apiKey: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxSteps: number;
  readonly maxStdoutLength: number;
  readonly basePrompt: string;
  readonly systemInfo?: string;
  readonly tokenPrices: TokenPrices;
}

export interface SchedulerConfig {
  readonly intervalHours: number;
  readonly jitterMinutes: number;
}

export interface MetricsConfig {
  readonly historyHours: number;
  readonly changeThreshold: number;
  readonly comparisonMinutes: readonly number[];
  readonly sensitiveCollectionDelayMs: number;
}

export interface HistoryConfig {
  readonly maxSymbols: number;
}

export interface ToolConfig {
  readonly timeoutMs: number;
  readonly maxCommandOutputSize: number;
  readonly maxLLMInputLength: number;
}

export interface TelegramConfig {
  readonly botToken: string;
  readonly ownerIds: readonly number[];
}

export interface LoggingConfig {
  readonly format: "pretty" | "json";
}

/**
 * Agent configuration - core functionality settings
 */
export interface AgentConfig {
  readonly dataDir: string;
  readonly history: HistoryConfig;
  readonly terminal: ToolConfig;
  readonly llm: LlmConfig;
}

/**
 * Parsed and validated configuration object
 */
export interface Config {
  readonly agent: AgentConfig;
  readonly telegram: TelegramConfig;
  readonly logging: LoggingConfig;
  readonly scheduler: SchedulerConfig;
  readonly metrics: MetricsConfig;
}

/**
 * Zod schema for configuration validation
 * Validates the entire configuration object structure
 */
export const configSchema = z.object({
  agent: z.object({
    dataDir: z.string(),
    history: z.object({
      maxSymbols: z.number().int().positive(),
    }),
    terminal: z.object({
      timeoutMs: z.number().int().positive(),
      maxCommandOutputSize: z.number().int().positive(),
      maxLLMInputLength: z.number().int().positive(),
    }),
    llm: z.object({
      provider: z.string(),
      apiKey: z.string().min(1),
      model: z.string(),
      temperature: z.number().nonnegative(),
      maxSteps: z.number().int().positive(),
      maxStdoutLength: z.number().int().positive(),
      basePrompt: z.string(),
      systemInfo: z.string().optional(),
      tokenPrices: z.object({
        inputTokens: z.number().nonnegative(),
        outputTokens: z.number().nonnegative(),
        totalTokens: z.number().nonnegative().optional(),
        reasoningTokens: z.number().nonnegative().optional(),
        cachedInputTokens: z.number().nonnegative().optional(),
      }),
    }),
  }),
  telegram: z.object({
    botToken: z.string().min(1),
    ownerIds: z.array(z.number().int().positive()).min(1),
  }),
  logging: z.object({
    format: z.enum(["pretty", "json"]),
  }),
  scheduler: z.object({
    intervalHours: z.number().int().positive(),
    jitterMinutes: z.number().int().nonnegative(),
  }),
  metrics: z.object({
    historyHours: z.number().int().positive(),
    changeThreshold: z.number().positive(),
    comparisonMinutes: z.array(z.number().int().positive()),
    sensitiveCollectionDelayMs: z.number().int().positive(),
  }),
});
