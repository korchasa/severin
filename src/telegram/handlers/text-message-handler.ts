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
import type { MainAgent } from "../../agent/agent.ts";
import { log } from "../../utils/logger.ts";
import { markdownToTelegramHTML } from "../telegram-format.ts";

/**
 * Creates a text message handler that processes any text message as an LLM query
 * Provides automatic message processing through the agent
 */
export function createTextMessageHandler(
  mainAgent: MainAgent,
  _config: Config,
) {
  return async (ctx: Context): Promise<void> => {
    const text = ctx.message?.text?.trim();

    // Skip empty messages or very short messages (likely typos)
    if (!text || text.length < 2) {
      log({
        "mod": "tg",
        "event": "text_message_ignored",
        "reason": "too_short",
        "length": text?.length || 0,
      });
      return;
    }

    // Skip messages that start with / (commands are handled separately)
    if (text.startsWith("/")) {
      return;
    }

    // Log the text message being sent to LLM
    log({
      "mod": "tg",
      "event": "text_message_to_llm",
      "text_length": text.length,
    });

    // Send typing action to show the bot is processing
    await ctx.api.sendChatAction(ctx.chat!.id, "typing");

    try {
      // Process query through agent
      const { text: response } = await mainAgent.processUserQuery({
        text,
        correlationId: ctx.update.update_id?.toString(),
      });

      // Don't send empty responses to avoid Telegram API errors
      if (response.trim()) {
        await ctx.reply(markdownToTelegramHTML(response), { parse_mode: "HTML" });
      }
      log({
        "mod": "tg",
        "event": "agent_response",
      });
    } catch (error) {
      await ctx.reply(
        markdownToTelegramHTML("An error occurred while processing the request."),
        {
          parse_mode: "HTML",
        },
      );
      log({
        "mod": "tg",
        "event": "llm_error",
        "message": (error as Error).message,
      });
    }
  };
}
