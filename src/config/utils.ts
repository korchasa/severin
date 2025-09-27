/**
 * Configuration utility functions
 */

/**
 * Type-safe environment variable getter with automatic type inference
 * @param name Environment variable name
 * @param defaultValue Default value (optional). If not provided, variable is required
 * @returns Environment variable value converted to the type of defaultValue, or defaultValue if variable not set
 * @throws {Error} if variable is required but not set, or if conversion fails
 */
export function env<T extends string | number | boolean>(
  name: string,
  defaultValue?: T,
): T {
  const value = Deno.env.get(name);

  if (value === undefined) {
    if (defaultValue === undefined) {
      throw new Error(`Required environment variable ${name} is not set`);
    }
    return defaultValue;
  }

  // Type-safe conversion based on default value type
  if (typeof defaultValue === "number") {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      throw new Error(`Environment variable ${name} must be a valid number, got: ${value}`);
    }
    return numValue as T;
  }

  if (typeof defaultValue === "boolean") {
    if (value === "true" || value === "1") {
      return true as T;
    }
    if (value === "false" || value === "0") {
      return false as T;
    }
    throw new Error(
      `Environment variable ${name} must be a valid boolean (true/false/1/0), got: ${value}`,
    );
  }

  return value as T;
}

/**
 * Parses owner IDs from environment variable as comma-separated values
 * @param envVar Environment variable name containing comma-separated owner IDs
 * @returns Array of numeric owner IDs
 * @throws {Error} if parsing fails or no valid IDs found
 */
export function parseOwnerIds(envVar: string): readonly number[] {
  const ownerIds = envVar
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));

  if (ownerIds.length === 0) {
    throw new Error(`Environment variable ${envVar} must contain at least one valid numeric ID`);
  }

  return ownerIds;
}

/**
 * Type-safe environment variable getter for optional numbers
 * @param name Environment variable name
 * @param defaultValue Default value (optional)
 * @returns Parsed number or undefined if not set and no default
 */
export function envNumberOptional(name: string, defaultValue?: number): number | undefined {
  const value = Deno.env.get(name);

  if (value === undefined) {
    return defaultValue;
  }

  const numValue = Number(value);
  if (isNaN(numValue)) {
    throw new Error(`Environment variable ${name} must be a valid number, got: ${value}`);
  }

  return numValue;
}

/**
 * Converts configuration to JSON string without PII (Personally Identifiable Information)
 * Masks sensitive data like API keys and tokens
 * @param config Configuration object
 * @returns JSON string with masked sensitive data
 */
export function toJSONWithoutPII(config: unknown): string {
  const masked = JSON.parse(JSON.stringify(config));

  // Mask API keys and tokens
  if (masked.agent?.llm?.apiKey) {
    masked.agent.llm.apiKey = maskString(masked.agent.llm.apiKey);
  }

  if (masked.telegram?.botToken) {
    masked.telegram.botToken = maskString(masked.telegram.botToken);
  }

  return JSON.stringify(masked, null, 2);
}

/**
 * Masks a string by showing first 4 and last 4 characters
 * @param str String to mask
 * @returns Masked string
 */
function maskString(str: string): string {
  if (str.length <= 8) {
    return "*".repeat(str.length);
  }
  return `${str.slice(0, 4)}${"*".repeat(str.length - 8)}${str.slice(-4)}`;
}
