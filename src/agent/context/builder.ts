import { type ModelMessage } from "ai";
import { SystemInfo } from "../../system-info/system-info.ts";
import { FactsStorage } from "../facts/types.ts";
import { HistoryCompactor } from "./compactor.ts";

export class ContextBuilder {
  private systemInfo: SystemInfo;
  private factsStorage: FactsStorage;
  private compactor: HistoryCompactor;
  /** Message history in AI SDK format (chronologically from beginning to end). */
  private messages: ModelMessage[] = [];
  /** Accumulated token usage from all LLM responses */
  private accumulatedTokens = 0;

  /**
   * Constructor with dependency injection for compactor
   * @param compactor - HistoryCompactor instance (handles message compression)
   * @param systemInfo - System information for context enrichment
   * @param factsStorage - Storage for persistent facts
   */
  constructor(compactor: HistoryCompactor, systemInfo: SystemInfo, factsStorage: FactsStorage) {
    this.compactor = compactor;
    this.systemInfo = systemInfo;
    this.factsStorage = factsStorage;
  }

  /**
   * Direct addition of ModelMessage (e.g., system message or arbitrary assistant message).
   * UIMessage is not supported; only ModelMessage should be used.
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
   * Uses HistoryCompactor to trim messages and ensure tool-call/tool-result consistency.
   * May use LLM for summarization if configured.
   */
  async getContext(
    systemPromptTemplate: string,
  ): Promise<{ systemPrompt: string; messages: ModelMessage[] }> {
    const systemPrompt = systemPromptTemplate
      .replace("{{SERVER_INFO}}", this.systemInfo.toMarkdown())
      .replace("{{FACTS}}", await this.factsStorage.toMarkdown());

    const compactedMessages = await Promise.resolve(this.compactor.compact(this.messages));

    return { systemPrompt, messages: compactedMessages };
  }

  /**
   * Add actual token usage from LLM response
   * Called after each LLM interaction to track real token consumption
   */
  addTokenUsage(inputTokens: number, outputTokens: number): void {
    this.accumulatedTokens += inputTokens + outputTokens;
  }

  /**
   * Get accumulated tokens used in history so far
   * Based on actual LLM response data, not estimates
   */
  getAccumulatedTokens(): number {
    return this.accumulatedTokens;
  }

  /**
   * Get current message count in history
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /** Complete history cleanup. */
  reset(): void {
    this.messages = [];
    this.accumulatedTokens = 0;
  }
}
