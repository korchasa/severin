/**
 * Common types for the Telegram-based Home Server Agent
 */

import type { Context } from "grammy";
import type { z } from "zod";

// History types
export type HistoryMsg = {
  readonly type: "msg";
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly ts: string;
};

// Terminal tool types
export interface TerminalRequest {
  readonly command: string;
  readonly cwd?: string;
  readonly reason: string;
}

export interface TerminalResponse {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stdoutTruncated: boolean;
  readonly stderr: string;
  readonly stderrTruncated: boolean;
  readonly durationMs: number;
}

// Tool registry types
export interface ToolCall<TIn> {
  readonly toolName: string;
  readonly input: TIn;
}

export interface ToolResult<TOut> {
  readonly ok: boolean;
  readonly result?: TOut;
  readonly error?: { code: string; message: string };
}

// Checks types
export type CheckStatus = "OK" | "WARN" | "CRIT";

export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  readonly details: string;
  readonly ts: string;
}

// Metrics types
export interface MetricValue {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly ts: string;
}

export interface Check {
  readonly name: string;
  run(): Promise<MetricValue[]>;
}

// LLM types
export interface LLMClient {
  generateText(input: {
    prompt: string;
    basePrompt?: string;
    maxSteps?: number;
  }): Promise<{ text: string; steps?: unknown[] }>;
}

export interface IPromptRenderer {
  render(toolsInfo: string): string;
}

// Facts types
export interface Fact {
  readonly id: string;
  readonly content: string;
  readonly ts: string;
}

// Facts storage interface
export interface FactsStorage {
  add(fact: Omit<Fact, "id" | "ts">): Promise<
    { success: true; fact: Fact } | { success: false; error: string }
  >;
  getAll(): Promise<
    { success: true; facts: readonly Fact[] } | { success: false; error: string }
  >;
  getById(id: string): Promise<
    { success: true; fact: Fact } | { success: false; error: string }
  >;
  update(id: string, content: string): Promise<
    { success: true; fact: Fact } | { success: false; error: string; id: string }
  >;
  delete(id: string): Promise<
    { success: true; id: string } | { success: false; error: string; id: string }
  >;
  toMarkdown(): Promise<string>;
}

// Command types
export interface CommandDef<A> {
  readonly name: string;
  readonly desc: string;
  readonly args: z.ZodType<A>;
  readonly handler: (ctx: Context, args: A) => Promise<void>;
}
