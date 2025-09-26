/**
 * LLM client interface and implementation.
 * Encapsulates LLM interaction with tools and policies.
 */

import type { ModelMessage } from "ai";

/**
 * Interface for LLM client implementations.
 * Provides unified access to text generation with tool support.
 */
export interface LLMClient {
  /**
   * Generates text response using configured LLM with tools.
   * Automatically adds system prompt and handles tool orchestration.
   *
   * @param messages - User/assistant message history (system messages added automatically)
   * @returns Promise resolving to generated text response
   * @throws Error if messages contain system messages (they're added automatically)
   */
  generateText(messages: ModelMessage[], activeTools: ActiveTool[]): Promise<{ text: string }>;
}

export type ActiveTool = "terminal" | "stop";
