/**
 * Terminal tool adapter with path validation and safe execution
 */
import type { TerminalRequest, TerminalResponse } from "../../core/types.ts";
import { log } from "../../utils/logger.ts";
import * as z from "zod";
import { tool } from "ai";
import { sh } from "../../utils/sh.ts";

export const TerminalParams = z.object({
  command: z.string().min(1, "command is required"),
  cwd: z.string().optional(),
  reason: z.string().min(1, "reason is required"),
});

export function createTerminalTool(
  timeoutMs: number,
  maxCommandOutputSize: number,
  maxLLMInputLength: number,
) {
  return tool({
    description: "Execute shell commands safely with validation and limits",
    inputSchema: TerminalParams,
    execute: async (input: z.infer<typeof TerminalParams>): Promise<TerminalResponse> => {
      // Log terminal tool usage
      log({
        mod: "llm",
        event: "llm_tool_execution",
        tool: "terminal",
        command: input.command,
        cwd: input.cwd,
        reason: input.reason,
      });

      const res = await executeTerminal(
        { command: input.command, cwd: input.cwd, reason: input.reason },
        timeoutMs,
        maxCommandOutputSize,
        maxLLMInputLength,
      );
      return res;
    },
  });
}

/**
 * Executes a terminal command with the given configuration
 * This is a high-level utility function for terminal execution with LLM-specific processing
 */
export async function executeTerminal(
  request: TerminalRequest,
  timeoutMs: number,
  maxCommandOutputSize: number,
  maxLLMInputLength: number,
): Promise<TerminalResponse> {
  // Stage 1: Preparation
  const validated = validateTerminal(request);
  const { controller, cleanup } = createTimeoutController(timeoutMs);

  // Log command start
  log({
    mod: "terminal",
    event: "command_start",
    command: validated.cmd,
    cwd: validated.cwd,
    reason: request.reason,
  });

  const start = Date.now();

  try {
    // Stage 2: Execution via sh()
    const cmd = sh(validated.cmd, {
      cwd: validated.cwd,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
      signal: controller.signal,
    });
    const result = await cmd.output();

    // Stage 3: Output processing — single truncation step for LLM display
    const rawStdout = result.stdoutText();
    const rawStderr = result.stderrText();

    const stdoutProcessed = truncateForLLM(rawStdout, maxCommandOutputSize, maxLLMInputLength);
    const stderrProcessed = truncateForLLM(rawStderr, maxCommandOutputSize, maxLLMInputLength);

    const durationMs = Date.now() - start;
    const exitCode = result.success ? 0 : result.code;

    // Stage 4: Log result (log already-trimmed strings, include flags)
    log({
      mod: "terminal",
      event: "command_result",
      command: validated.cmd,
      cwd: validated.cwd,
      reason: request.reason,
      exitCode,
      durationMs,
      stdoutTruncated: stdoutProcessed.truncated,
      stderrTruncated: stderrProcessed.truncated,
    });

    return {
      exitCode,
      stdout: stdoutProcessed.output,
      stdoutTruncated: stdoutProcessed.truncated,
      stderr: stderrProcessed.output,
      stderrTruncated: stderrProcessed.truncated,
      durationMs,
      command: request.command,
    };
  } finally {
    cleanup();
  }
}

/**
 * Validates terminal request.
 * @returns validated command parameters
 */
export function validateTerminal(
  req: TerminalRequest,
): { cmd: string; cwd: string } {
  // Command is now the full command string, no separate args processing needed

  return { cmd: req.command, cwd: req.cwd ?? "/" };
}

/**
 * Creates a timeout controller
 */
function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("timeout"),
    timeoutMs,
  );

  return {
    controller,
    cleanup: () => clearTimeout(timeout),
  };
}

/**
 * Truncates output to maximum size
 */
function truncateForLLM(
  text: string,
  maxCommandOutputSize: number,
  maxDisplayLength: number,
): { output: string; truncated: boolean } {
  // Apply a single truncation respecting both byte cap and display cap
  const limit = Math.min(maxCommandOutputSize, maxDisplayLength);
  if (text.length <= limit) {
    return { output: text, truncated: false };
  }

  // Prefer cutting at a line boundary near the limit
  const cutAt = (() => {
    const nl = text.lastIndexOf("\n", limit);
    if (nl >= Math.floor(limit * 0.8)) return nl; // good boundary
    return limit;
  })();

  return {
    output: text.slice(0, cutAt) + "\n... (output truncated)",
    truncated: true,
  };
}
