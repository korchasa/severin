/**
 * Conversation history management with symbol-based limiting on retrieval
 */

import type { HistoryMsg } from "../../core/types.ts";

/**
 * Internal conversation history wrapper.
 * Stores complete conversation history and limits output only when retrieving messages.
 */
export class ConversationHistory {
  private history: HistoryMsg[] = [];

  constructor() {
    // No parameters needed - getRecentMessages accepts maxSymbols as parameter
  }

  /**
   * Adds a record to history.
   * Note: No automatic trimming is performed - use getRecentMessages() to limit output.
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
   * Gets recent conversation messages that fit within the specified symbol limit.
   * Returns the most recent messages that can fit within maxSymbols characters.
   * @param maxSymbols Maximum total characters allowed for all messages combined
   */
  getRecentMessages(maxSymbols: number): HistoryMsg[] {
    const result: HistoryMsg[] = [];
    let totalSymbols = 0;

    // Start from the most recent messages and work backwards
    for (let i = this.history.length - 1; i >= 0; i--) {
      const message = this.history[i];
      const messageLength = message.content.length;

      // Check if adding this message would exceed the limit
      if (totalSymbols + messageLength > maxSymbols) {
        // If we already have messages, stop here
        if (result.length > 0) {
          break;
        }
        // If this is the first message and it exceeds limit, skip it and continue
        continue;
      }

      // Add message to the beginning of result to maintain chronological order (oldest first)
      result.unshift(message);
      totalSymbols += messageLength;
    }

    return result;
  }

  /**
   * Resets conversation history
   */
  reset(): void {
    this.history = [];
  }
}
