/**
 * Conversation history management with automatic message limiting
 */

import type { HistoryMsg } from "../../core/types.ts";

/**
 * Internal conversation history wrapper.
 * Manages conversation history with automatic trimming to stay within message limits.
 */
export class ConversationHistory {
  private readonly maxMessages: number;
  private history: HistoryMsg[] = [];

  constructor(maxMessages: number) {
    this.maxMessages = maxMessages;
  }

  /**
   * Adds a record to history and maintains message limit.
   * When adding a message, checks the limit and removes old records if exceeded.
   * Messages are automatically trimmed to stay within the configured limit.
   */
  private append(line: HistoryMsg): void {
    this.history.push(line);
  }

  /**
   * Appends a message to conversation history
   */
  appendMessage(role: "user" | "assistant", content: string): void {
    const message: HistoryMsg = {
      type: "msg",
      role,
      content,
      ts: new Date().toISOString(),
    };
    this.append(message);
  }

  /**
   * Gets recent conversation context for LLM
   */
  getContext(): HistoryMsg[] {
    return this.history.slice(-this.maxMessages);
  }

  /**
   * Resets conversation history
   */
  reset(): void {
    this.history = [];
  }
}
