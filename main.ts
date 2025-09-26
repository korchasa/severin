/**
 * Telegram-based Home Server Agent (PoC)
 * - Runtime: Deno
 * - Interfaces: grammy (long polling), zod validation, Responses API for LLM tools
 * - Storage: file-based JSONL (history.jsonl, audit logs)
 *
 * Main entry point that initializes and starts the agent.
 * Code is now organized in modules according to design.md
 */

import { startAgent } from "./src/app.ts";

// Start the agent if this is the main module
if (import.meta.main) {
  await startAgent();
}
