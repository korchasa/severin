/**
 * Text message handler - processes any text message as an LLM query
 * Provides automatic text message processing with agent integration
 *
 * Features:
 * - Filters out very short messages (likely typos)
 * - Logs all text messages sent to agent for monitoring
 */

import type { Context } from "grammy";
import type { Config } from "../../config/types.ts";
import type { MainAgent } from "../../agent/main-agent.ts";
import { log } from "../../utils/logger.ts";
import { ToolSet, TypedToolCall, TypedToolResult } from "ai";
import { createMessageBuilder } from "./message-builder.ts";

/**
 * Creates a text message handler that processes any text message as an LLM query
 * Provides automatic message processing through the agent
 */
export function createTextMessageHandler(
  mainAgent: MainAgent,
  _config: Config,
) {
  return async (ctx: Context): Promise<void> => {
    const userQuery = ctx.message?.text?.trim();

    // Skip empty messages or very short messages (likely typos)
    if (!userQuery || userQuery.length < 2) {
      log({
        mod: "tg",
        event: "text_message_ignored",
        reason: "too_short",
        length: userQuery?.length || 0,
      });
      return;
    }

    // Skip messages that start with / (commands are handled separately)
    if (userQuery.startsWith("/")) {
      return;
    }

    // Log the text message being sent to LLM
    log({
      mod: "tg",
      event: "text_message_to_llm",
      text_length: userQuery.length,
    });

    // Send typing action to show the bot is processing
    const message = await ctx.reply("...", { parse_mode: "HTML" });
    const correlationId = message.message_id.toString();
    const messageBuilder = createMessageBuilder();
    try {
      // Process query through agent
      const { text: responseText, cost } = await mainAgent.processUserQuery({
        userQuery: userQuery,
        correlationId: correlationId,
        onThoughts: async (thoughts) => {
          messageBuilder.setThoughts(thoughts);
          await messageBuilder.updateMessage(ctx, message);
        },
        beforeCall: async (call: TypedToolCall<ToolSet>) => {
          messageBuilder.addToolCall(call);
          await messageBuilder.updateMessage(ctx, message);
        },
        afterCall: async (result: TypedToolResult<ToolSet>) => {
          messageBuilder.addToolResult(result);
          await messageBuilder.updateMessage(ctx, message);
        },
      });

      // Don't send empty responses to avoid Telegram API errors
      if (responseText.trim()) {
        messageBuilder.addFinalText(responseText, cost);
        await messageBuilder.updateMessage(ctx, message);
      }
      log({
        mod: "tg",
        event: "agent_response",
        response_length: responseText.length,
      });
    } catch (error) {
      messageBuilder.setError(error as Error);
      await messageBuilder.updateMessage(ctx, message);
      log({
        mod: "tg",
        event: "llm_error",
        message: (error as Error).message,
        trace: (error as Error).stack,
      });
    }
  };
}
