import { type ModelMessage } from "ai";

/**
 * Interface for context compaction functionality
 */
export interface ContextCompactor {
  /**
   * Compacts the context by trimming messages from the beginning (oldest first)
   * to fit within the symbol budget while maintaining tool-call/tool-result consistency.
   */
  compact(messages: readonly ModelMessage[]): ModelMessage[];

  /**
   * Estimate message "weight" by length of JSON representation of content.
   */
  estimateSymbols(message: ModelMessage): number;
}

/**
 * Context compactor - handles message trimming within symbol limits
 * while maintaining tool-call/tool-result consistency.
 */
export class SimpleContextCompactor implements ContextCompactor {
  private maxSymbols: number;

  constructor(maxSymbols: number) {
    this.maxSymbols = maxSymbols;
  }

  /**
   * Compacts the context by trimming messages from the beginning (oldest first)
   * to fit within the symbol budget while maintaining tool-call/tool-result consistency.
   */
  compact(messages: readonly ModelMessage[]): ModelMessage[] {
    // First, trim by symbol limit
    const trimmedMessages = this.trimBySymbolLimit(messages);

    // Then ensure tool-call/tool-result consistency
    return this.ensureToolConsistency(trimmedMessages);
  }

  /** Estimate message "weight" by length of JSON representation of content. */
  estimateSymbols(message: ModelMessage): number {
    const c: unknown = (message as unknown as { content: unknown }).content;
    if (typeof c === "string") return c.length;
    try {
      return JSON.stringify(c ?? "").length;
    } catch {
      return 0;
    }
  }

  /**
   * Type guard for tool-call content parts
   */
  private isToolCallPart(part: unknown): part is { type: "tool-call"; toolCallId: string } {
    return typeof part === "object" &&
      part !== null &&
      "type" in part &&
      part.type === "tool-call" &&
      "toolCallId" in part &&
      typeof (part as Record<string, unknown>).toolCallId === "string";
  }

  /**
   * Type guard for tool-result content parts
   */
  private isToolResultPart(
    part: unknown,
  ): part is { type: "tool-result"; toolCallId: string } {
    return typeof part === "object" &&
      part !== null &&
      "type" in part &&
      part.type === "tool-result" &&
      "toolCallId" in part &&
      typeof (part as Record<string, unknown>).toolCallId === "string";
  }

  /**
   * Trims messages from the beginning to fit within the symbol budget.
   * Messages are taken from the end (most recent) and added to the result.
   */
  private trimBySymbolLimit(messages: readonly ModelMessage[]): ModelMessage[] {
    const out: ModelMessage[] = [];
    let total = 0;

    // Start from the most recent messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const len = this.estimateSymbols(msg);

      if (total + len > this.maxSymbols) {
        if (out.length > 0) break; // already have something — finish
        // first candidate message is too large by itself — skip and continue
        continue;
      }

      out.unshift(msg);
      total += len;
    }

    return out;
  }

  /**
   * Ensures tool-call/tool-result consistency in the message list.
   * Removes tool-results without corresponding tool-calls and tool-calls without corresponding tool-results.
   */
  private ensureToolConsistency(messages: ModelMessage[]): ModelMessage[] {
    const toolCalls = new Set<string>();
    const toolResults = new Set<string>();

    // Collect all tool-call and tool-result IDs
    for (const msg of messages) {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (this.isToolCallPart(part)) {
            toolCalls.add(part.toolCallId);
          }
        }
      } else if (msg.role === "tool" && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (this.isToolResultPart(part)) {
            toolResults.add(part.toolCallId);
          }
        }
      }
    }

    // Filter messages to keep only consistent tool-call/tool-result pairs
    return messages.filter((msg) => {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        // Check if assistant message has tool-calls that have corresponding results
        const hasInconsistentToolCalls = msg.content.some((part) =>
          this.isToolCallPart(part) && !toolResults.has(part.toolCallId)
        );
        return !hasInconsistentToolCalls;
      } else if (msg.role === "tool" && Array.isArray(msg.content)) {
        // Check if tool message has results that have corresponding calls
        const hasInconsistentToolResults = msg.content.some((part) =>
          this.isToolResultPart(part) && !toolCalls.has(part.toolCallId)
        );
        return !hasInconsistentToolResults;
      }
      // Keep non-tool messages
      return true;
    });
  }
}
