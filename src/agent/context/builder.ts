import { type ModelMessage } from "ai";
import { SystemInfo } from "../../system-info/system-info.ts";
import { FactsStorage } from "../facts/types.ts";

export class ContextBuilder {
  private maxSymbols: number;
  private systemInfo: SystemInfo;
  private factsStorage: FactsStorage;
  /** Message history in AI SDK format (chronologically from beginning to end). */
  private messages: ModelMessage[] = [];

  constructor(maxSymbols: number, systemInfo: SystemInfo, factsStorage: FactsStorage) {
    this.maxSymbols = maxSymbols;
    this.systemInfo = systemInfo;
    this.factsStorage = factsStorage;
  }

  /**
   * Direct addition of ModelMessage (e.g., system message or arbitrary assistant message).
   * UIMessage is not supported here — convert beforehand if needed.
   */
  append(msg: ModelMessage): void {
    this.messages.push(msg);
  }

  /**
   * Addition of messages from step.response.messages with deduplication by content.
   * Only messages that are not yet in history are recorded.
   *
   * @param stepMessages - Array of messages from step.response.messages
   */
  appendStepMessages(stepMessages: readonly ModelMessage[]): void {
    for (const msg of stepMessages) {
      const msgHash = this.hashMessage(msg);

      // Check if message with this hash already exists
      const isDuplicate = this.messages.some((existingMsg) =>
        this.hashMessage(existingMsg) === msgHash
      );

      if (isDuplicate) {
        continue;
      }

      // Add message to history
      this.messages.push(msg);
    }
  }

  /**
   * Create hash of message content for deduplication.
   * Uses JSON.stringify for content serialization.
   */
  private hashMessage(message: ModelMessage): string {
    try {
      // Serialize message to JSON for hash creation
      const serialized = JSON.stringify({
        role: message.role,
        content: message.content,
        // Ignore providerOptions and other metadata
      });
      return serialized;
    } catch {
      // If serialization failed, use string representation
      return String(message.content);
    }
  }

  /**
   * Returns a "window" of recent context within the symbol budget.
   * Messages are taken from the end of history and added to the beginning of the result until budget overflow.
   */
  async getContext(
    systemPromptTemplate: string,
  ): Promise<{ systemPrompt: string; messages: ModelMessage[] }> {
    const systemPrompt = systemPromptTemplate
      .replace("{{SERVER_INFO}}", this.systemInfo.toMarkdown())
      .replace("{{FACTS}}", await this.factsStorage.toMarkdown());
    const out: ModelMessage[] = [];
    let total = 0;

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      const len = this.estimateSymbols(msg);

      if (total + len > this.maxSymbols) {
        if (out.length > 0) break; // already have something — finish
        // first candidate message is too large by itself — skip and continue
        continue;
      }

      out.unshift(msg);
      total += len;
    }

    return { systemPrompt, messages: out };
  }

  /** Complete history cleanup. */
  reset(): void {
    this.messages = [];
  }

  /** Estimate message "weight" by length of JSON representation of content. */
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
