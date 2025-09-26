import type { Config } from "./types.ts";
import { configSchema } from "./types.ts";
import { createDefaultConfig } from "./config.ts";
/**
 * Loads environment variables from .env file if it exists
 * @returns Object with environment variables from .env file
 */
function loadDotEnv(): Record<string, string | undefined> {
  try {
    const envPath = `${Deno.cwd()}/.env`;
    const content = Deno.readTextFileSync(envPath);
    const env: Record<string, string | undefined> = {};

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const equalIndex = trimmed.indexOf("=");
      if (equalIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, equalIndex).trim();
      const value = trimmed.slice(equalIndex + 1).trim();

      // Remove surrounding quotes if present
      const unquotedValue = value.replace(/^["']|["']$/g, "");
      env[key] = unquotedValue;
    }

    return env;
  } catch (error) {
    // .env file doesn't exist or can't be read, return empty object
    if (error instanceof Deno.errors.NotFound) {
      return {};
    }
    throw error;
  }
}

/**
 * Cached configuration instance
 * Exported for testing purposes to allow cache clearing
 */
export let cachedConfig: Config | null = null;

/**
 * Clears the configuration cache
 * Used for testing purposes
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Loads and validates environment configuration
 * Uses caching to avoid repeated parsing of environment variables
 * @param systemInfo - Optional system information to include in system prompt
 * @throws {Error} if required variables are missing or invalid
 */
export function loadConfig(systemInfo?: string): Config {
  if (cachedConfig && !systemInfo) {
    return cachedConfig;
  }

  // Load variables from .env file and set them in environment if they don't exist
  const dotEnvVars = loadDotEnv();

  // Set .env variables in Deno.env if they are not already set
  for (const [key, value] of Object.entries(dotEnvVars)) {
    if (Deno.env.get(key) === undefined && value !== undefined) {
      Deno.env.set(key, value);
    }
  }

  // Create configuration using the new helper functions
  // This will read directly from environment variables
  const config = createDefaultConfig(systemInfo);

  // Validate the entire configuration object using zod schema
  const validatedConfig = configSchema.parse(config);

  // Cache the configuration for future calls (only if no system info provided)
  if (!systemInfo) {
    cachedConfig = validatedConfig;
  }

  return validatedConfig;
}
