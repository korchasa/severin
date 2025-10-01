import {
  type JSONValue,
  type ModelMessage,
  StepResult,
  Tool,
  ToolCallPart,
  ToolResultPart,
} from "ai";
import { SystemInfo } from "../../system-info/system-info.ts";
import { Fact, FactsStorage } from "../facts/types.ts";
import { LanguageModelV2ToolResultOutput } from "@ai-sdk/provider";

type TextPart = { type: "text"; text: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isToolCallPart(p: unknown): p is ToolCallPart {
  if (!isObject(p)) return false;
  const t = (p as { type?: unknown }).type;
  const id = (p as { toolCallId?: unknown }).toolCallId;
  const name = (p as { toolName?: unknown }).toolName;
  return t === "tool-call" && typeof id === "string" && typeof name === "string";
}

function isToolResultPart(p: unknown): p is ToolResultPart {
  if (!isObject(p)) return false;
  const t = (p as { type?: unknown }).type;
  const id = (p as { toolCallId?: unknown }).toolCallId;
  const name = (p as { toolName?: unknown }).toolName;
  const output = (p as { output?: unknown }).output;
  return t === "tool-result" && typeof id === "string" && typeof name === "string" &&
    output !== undefined;
}

function isTextPart(p: unknown): p is TextPart {
  if (!isObject(p)) return false;
  const t = (p as { type?: unknown }).type;
  const text = (p as { text?: unknown }).text;
  return t === "text" && typeof text === "string";
}

function toJSONValue(value: unknown): JSONValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const arr = value.map((v): JSONValue => toJSONValue(v));
    return arr;
  }
  if (isObject(value)) {
    const out: Record<string, JSONValue> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toJSONValue(v);
    }
    return out;
  }
  // unsupported types (undefined, function, symbol, bigint) → stringify fallback
  return String(value) as unknown as JSONValue;
}

/** Domain event model (SDK-agnostic). */
type Event =
  | { type: "system"; text: string }
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "tool-call"; id: string; name: string; args: unknown }
  | { type: "tool-result"; id: string; name: string; output: LanguageModelV2ToolResultOutput };

export class ContextBuilder {
  private maxSymbols: number;
  private systemInfo: SystemInfo;
  private factsStorage: FactsStorage;

  /** Internal, SDK-agnostic log of events in chronological order. */
  private events: Event[] = [];

  /** Optional base prompt template with placeholders {{SERVER_INFO}} and {{FACTS}}. */
  basePromptTemplate?: string;

  constructor(maxSymbols: number, systemInfo: SystemInfo, factsStorage: FactsStorage) {
    this.maxSymbols = maxSymbols;
    this.systemInfo = systemInfo;
    this.factsStorage = factsStorage;
  }

  setBasePromptTemplate(basePromptTemplate: string): void {
    this.basePromptTemplate = basePromptTemplate;
  }

  /** Append a plain user query (write immediately on request start). */
  appendUserQuery(userQuery: string) {
    this.events.push({ type: "user", text: userQuery });
  }

  /**
   * Append the results of one assistant "step".
   * Records tool-calls, then tool-results, then final assistant text (if any).
   */
  appendAgentStep(
    step: StepResult<
      NoInfer<{
        terminal: Tool;
        add_fact: Tool<
          { content: string },
          { success: true; fact: Fact } | { success: false; error: string }
        >;
        update_fact: Tool<
          { id: string; content: string },
          | { success: true; fact: Fact }
          | { success: false; error: string; id: string }
        >;
        delete_fact: Tool<
          { id: string },
          | { success: true; id: string }
          | { success: false; error: string; id: string }
        >;
      }>
    >,
  ) {
    // Final assistant text
    if (step.text && step.text.trim().length > 0) {
      this.events.push({ type: "assistant", text: step.text });
    }

    // Tool calls
    if (step.toolCalls.length > 0) {
      for (const tc of step.toolCalls) {
        const tcArgs = ("args" in tc ? (tc as { args?: unknown }).args : undefined) ??
          ("input" in tc ? (tc as { input?: unknown }).input : undefined) ??
          {};
        this.events.push({
          type: "tool-call",
          id: tc.toolCallId,
          name: tc.toolName as unknown as string,
          // Store SDK-agnostic shape
          args: tcArgs,
        });
      }
    }

    // Tool results
    for (const tr of step.toolResults) {
      this.events.push({
        type: "tool-result",
        id: tr.toolCallId,
        name: tr.toolName,
        output: this.normalizeToolOutput(tr.output),
      });
    }
  }

  /**
   * Accepts a ModelMessage and maps it into internal Event[].
   * (UIMessage is not supported here; convert upstream if needed.)
   */
  append(msg: ModelMessage): void {
    const { role, content } = msg;

    // Simple text messages
    if (typeof content === "string") {
      if (role === "user") {
        this.events.push({ type: "user", text: content });
      } else if (role === "assistant") {
        this.events.push({ type: "assistant", text: content });
      } else if (role === "system") {
        this.events.push({ type: "system", text: content });
      }
      return;
    }

    // Array of parts (tool-calls, tool-results, text)
    if (Array.isArray(content)) {
      const parts = content as Array<ToolCallPart | ToolResultPart | TextPart>;

      for (const p of parts) {
        if (isToolCallPart(p)) {
          // ToolCallPart in V2 uses `input`
          this.events.push({
            type: "tool-call",
            id: p.toolCallId,
            name: p.toolName,
            args: p.input ?? {},
          });
        } else if (isToolResultPart(p)) {
          this.events.push({
            type: "tool-result",
            id: p.toolCallId,
            name: p.toolName,
            output: this.normalizeToolOutput(p.output),
          });
        } else if (isTextPart(p)) {
          const text = p.text;
          if (role === "system") this.events.push({ type: "system", text });
          else if (role === "user") this.events.push({ type: "user", text });
          else this.events.push({ type: "assistant", text });
        }
      }

      return;
    }

    // If content is neither string nor array, attempt to stringify & keep as assistant text for debugging
    try {
      const s = JSON.stringify(content);
      if (role === "user") this.events.push({ type: "user", text: s });
      else if (role === "system") this.events.push({ type: "system", text: s });
      else this.events.push({ type: "assistant", text: s });
    } catch {
      // ignore silently
    }
  }

  async generateBasePrompt(): Promise<string> {
    if (!this.basePromptTemplate) {
      throw new Error("Base prompt template is not set");
    }
    return this.basePromptTemplate
      .replace("{{SERVER_INFO}}", this.systemInfo.toMarkdown())
      .replace("{{FACTS}}", await this.factsStorage.toMarkdown());
  }

  /**
   * Build a ModelMessage[] view of the recent conversation within the symbol budget.
   * - Groups consecutive 'tool-call' events into a single assistant message with ToolCallPart[].
   * - Emits each 'tool-result' as a separate tool message.
   * - Preserves chronological order.
   */
  getContext(): ModelMessage[] {
    const result: ModelMessage[] = [];
    let totalSymbols = 0;

    // We'll iterate from the end and unshift(), while grouping consecutive tool-calls.
    let toolCallBuffer: ToolCallPart[] = [];

    const flushToolCalls = () => {
      if (toolCallBuffer.length === 0) return true;
      // Reverse because we were iterating backwards.
      const parts = [...toolCallBuffer].reverse();
      const msg: ModelMessage = { role: "assistant", content: parts };
      const len = this.estimateSymbols(msg);
      if (totalSymbols + len > this.maxSymbols) {
        if (result.length > 0) return false;
        // If first message doesn't fit — drop the group and continue (like previous logic).
        toolCallBuffer = [];
        return true;
      }
      result.unshift(msg);
      totalSymbols += len;
      toolCallBuffer = [];
      return true;
    };

    // Walk backward through events
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i];

      if (ev.type === "tool-call") {
        // Buffer, we'll flush when the block ends.
        toolCallBuffer.push({
          type: "tool-call",
          toolCallId: ev.id,
          toolName: ev.name,
          input: ev.args,
        });
        // Continue accumulating
        continue;
      }

      // Hitting a non tool-call event: flush buffered tool-calls first.
      if (!flushToolCalls()) break;

      // Convert the event to a ModelMessage and budget it.
      let msg: ModelMessage | null = null;

      switch (ev.type) {
        case "user":
          msg = { role: "user", content: ev.text };
          break;
        case "system":
          msg = { role: "system", content: ev.text };
          break;
        case "assistant":
          msg = { role: "assistant", content: [{ type: "text", text: ev.text }] };
          break;
        case "tool-result":
          msg = {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: ev.id,
                toolName: ev.name,
                output: ev.output,
              },
            ],
          };
          break;
      }

      if (!msg) continue;

      const len = this.estimateSymbols(msg);
      if (totalSymbols + len > this.maxSymbols) {
        if (result.length > 0) break;
        // Skip too-large first candidate and continue looking for smaller items.
        continue;
      }

      result.unshift(msg);
      totalSymbols += len;
    }

    // Flush any leading tool-calls at the very start
    flushToolCalls();

    return result;
  }

  /** Resets conversation history. */
  reset(): void {
    this.events = [];
  }

  /**
   * Normalizes arbitrary tool outputs to LanguageModelV2ToolResultOutput required by ModelMessage.
   * - Strings become { type: 'text', value: string }
   * - Objects with { type, value } pass through
   * - Everything else becomes { type: 'json', value: any }
   */
  private normalizeToolOutput(output: unknown): LanguageModelV2ToolResultOutput {
    if (isObject(output) && "type" in output && "value" in output) {
      return output as unknown as LanguageModelV2ToolResultOutput;
    }
    if (typeof output === "string") {
      return { type: "text", value: output };
    }
    return { type: "json", value: toJSONValue(output) };
  }

  /**
   * Estimate symbol count of a ModelMessage content for budgeting.
   * For string content use its length; for non-string content JSON-stringify.
   */
  private estimateSymbols(message: ModelMessage): number {
    const c: unknown = (message as unknown as { content: unknown }).content;
    if (typeof c === "string") return c.length;
    try {
      return JSON.stringify(c ?? "").length;
    } catch {
      return 0;
    }
  }
}
