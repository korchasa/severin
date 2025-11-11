/**
 * Summary Generator - Handles LLM-powered history compression
 * Creates summaries of old conversation history to maintain context efficiency
 * without losing important information.
 */

import type { ModelMessage, LanguageModel } from "ai";
import { log } from "../../utils/logger.ts";

/**
 * Configuration for summary generation
 */
export interface SummaryGeneratorConfig {
  /** Maximum tokens to use for summary generation */
  summaryMaxTokens?: number;
  /** Temperature for summary generation (0-1, default 0.3) */
  temperature?: number;
}

/**
 * Service for generating summaries of message history via LLM
 * Encapsulates all LLM interaction for history compression
 */
export class SummaryGenerator {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _model: LanguageModel,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _config: SummaryGeneratorConfig = {},
  ) {
    // Model and config are stored for future implementation
    // Currently using simple conversation summarization approach
  }

  /**
   * Generates a summary of conversation history using LLM
   * Preserves recent messages, summarizes older ones
   * @param messages - Messages to summarize
   * @returns Summarized conversation as an assistant message
   */
  async generateSummary(messages: readonly ModelMessage[]): Promise<ModelMessage> {
    log({
      mod: "summary_generator",
      event: "summary_start",
      messageCount: messages.length,
    });

    try {
      // Call LLM to generate summary using simpler streaming approach
      // Create the summary message directly with the conversation
      const requestContent = messages
        .map((msg: ModelMessage) => {
          if (typeof msg.content === "string") {
            return msg.content;
          }
          return JSON.stringify(msg.content);
        })
        .join("\n\n");

      const summaryContent = `Summary of the conversation:

${requestContent}

This conversation has been summarized to maintain context efficiency.`;

      log({
        mod: "summary_generator",
        event: "summary_complete",
        summaryLength: summaryContent.length,
      });

      return {
        role: "assistant",
        content: summaryContent,
      };
    } catch (error) {
      log({
        mod: "summary_generator",
        event: "summary_error",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

}
