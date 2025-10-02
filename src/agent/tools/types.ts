/**
 * Types for agent tools
 */

import { z } from "zod";

export const TerminalRequestSchema = z.object({
  command: z.string().min(1, "command is required").describe("The command to execute"),
  cwd: z.string().optional().describe("The working directory to execute the command in"),
  reason: z.string().min(1, "reason is required").describe("The reason for executing the command"),
});
export type TerminalRequest = z.infer<typeof TerminalRequestSchema>;

export const TerminalResponseSchema = z.object({
  exitCode: z.number().describe("The exit code of the command"),
  stdout: z.string().describe("The stdout of the command"),
  stdoutTruncated: z.boolean().describe("Whether the stdout was truncated"),
  stderr: z.string().describe("The stderr of the command"),
  stderrTruncated: z.boolean().describe("Whether the stderr was truncated"),
  durationMs: z.number().describe("The duration of the command in milliseconds"),
  command: z.string().describe("The command that was executed"),
});
export type TerminalResponse = z.infer<typeof TerminalResponseSchema>;

export interface ToolCall<TIn> {
  readonly toolName: string;
  readonly input: TIn;
}

export interface ToolResult<TOut> {
  readonly ok: boolean;
  readonly result?: TOut;
  readonly error?: { code: string; message: string };
}
