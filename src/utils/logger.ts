/**
 * Structured logging infrastructure with pretty and JSON format support
 * Provides human-readable development logs and machine-readable production logs
 */

import type { Context } from "grammy";

// Global logger configuration - initialized once at startup
const loggerConfig = { format: "pretty" as "pretty" | "json" };

/**
 * Initializes logger with configuration
 * Must be called before any logging functions
 */
export function initializeLogger(format: "pretty" | "json"): void {
  loggerConfig.format = format;
}

/**
 * Detects if terminal supports colors
 * Returns false in CI environments or when colors are not supported
 */
function supportsColor(): boolean {
  // Disable colors in CI environments
  if (Deno.env.get("CI") === "true" || Deno.env.get("CONTINUOUS_INTEGRATION") === "true") {
    return false;
  }

  // Check if stdout is a TTY
  try {
    return Deno.stdout.isTerminal();
  } catch {
    return false;
  }
}

/**
 * Formats a log entry as pretty human-readable text with optional colors
 */
function formatPretty(fields: Record<string, unknown>): string {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm format
  const mod = fields.mod as string || "unknown";
  const event = fields.event as string || "unknown";

  // Remove mod and event from fields for display
  const { mod: _, event: __, ts: ___, ...rest } = fields;

  const supportsColors = supportsColor();
  const modColor = supportsColors ? "\x1b[1;36m" : ""; // Cyan for module
  const eventColor = supportsColors ? "\x1b[1;32m" : ""; // Green for event
  const resetColor = supportsColors ? "\x1b[0m" : "";

  const parts: string[] = [
    `[${timestamp}]`,
    `${modColor}${mod.toUpperCase()}${resetColor}`,
    `${eventColor}${event}${resetColor}`,
  ];

  // Add key-value pairs for remaining fields
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null) {
      const displayValue = typeof value === "string" ? `"${value}"` : String(value);
      parts.push(`${key}=${displayValue}`);
    }
  }

  return parts.join(" ");
}

/**
 * Formats a log entry as JSON string
 */
function formatJson(fields: Record<string, unknown>): string {
  const base = { ts: new Date().toISOString() };
  return JSON.stringify({ ...base, ...fields });
}

/**
 * Logs a structured message to console in configured format
 * Supports both pretty (human-readable) and JSON formats
 */
export function log(fields: Record<string, unknown>): void {
  if (loggerConfig.format === "json") {
    console.log(formatJson(fields));
  } else {
    console.log(formatPretty(fields));
  }
}

/**
 * Generates a unique correlation ID for request tracking
 */
export function genCorrelationId(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rnd}`;
}

/**
 * Logs Telegram update processing with correlation tracking
 */
export function logUpdate(
  _ctx: Context,
  event: string,
  extra: Record<string, unknown> = {},
): void {
  log({
    mod: "tg",
    event,
    ...extra,
  });
}

/**
 * Logs outgoing Telegram messages with correlation tracking
 */
export function logOutgoingMessage(
  _ctx: Context,
  method: string,
  _chatId: number | string,
  text: string,
  extra: Record<string, unknown> = {},
): void {
  log({
    mod: "tg",
    event: "message_out",
    method,
    message_text: text,
    ...extra,
  });
}

/**
 * Logs outgoing Telegram messages without context (for scheduler/background tasks)
 */
export function logOutgoingMessageNoContext(
  method: string,
  chatId: number | string,
  text: string,
  extra: Record<string, unknown> = {},
): void {
  log({
    mod: "tg",
    event: "message_out",
    method,
    chat_id: chatId,
    message_text: text,
    source: "scheduler",
    ...extra,
  });
}
