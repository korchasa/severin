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
import { markdownToTelegramHTML } from "../telegram-format.ts";
import { ToolSet, TypedToolCall, TypedToolResult } from "ai";

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
    await ctx.api.sendChatAction(ctx.chat!.id, "typing");
    const correlationId = ctx.message!.message_id?.toString();
    try {
      // Process query through agent
      const { text: responseText, cost } = await mainAgent.processUserQuery({
        userQuery: userQuery,
        correlationId: correlationId,
        onThoughts: async (thoughts) => {
          const thoughtsHTML = markdownToTelegramHTML(thoughts);
          await ctx.reply(
            `<blockquote expandable>${thoughtsHTML}</blockquote>`,
            { parse_mode: "HTML" },
          );
        },
        beforeCall: async (call: TypedToolCall<ToolSet>) => {
          switch (call.toolName) {
            case "terminal": {
              const reasonHTML = markdownToTelegramHTML(
                call.input.reason.replace(/\n/g, "\n# "),
              );
              const commandHTML = markdownToTelegramHTML(call.input.command);
              await ctx.reply(
                `<blockquote><pre><code class="language-bash"># ${reasonHTML}\n&gt; ${commandHTML}</code></pre></blockquote>`,
                { parse_mode: "HTML" },
              );
              break;
            }
            case "add_fact": {
              const contentHTML = markdownToTelegramHTML(call.input.content);
              await ctx.reply(
                `<blockquote>Add fact "${contentHTML}"</blockquote>`,
                { parse_mode: "HTML" },
              );
              break;
            }
            case "update_fact": {
              const contentHTML = markdownToTelegramHTML(call.input.content);
              await ctx.reply(
                `<blockquote>Update fact "${contentHTML}"</blockquote>`,
                { parse_mode: "HTML" },
              );
              break;
            }
            case "delete_fact": {
              const idHTML = markdownToTelegramHTML(call.input.id);
              await ctx.reply(
                `<blockquote>Delete fact "${idHTML}"</blockquote>`,
                { parse_mode: "HTML" },
              );
              break;
            }
            default: {
              throw new Error(`Unexpected tool: ${call.toolName}`);
            }
          }
        },
        afterCall: (_result: TypedToolResult<ToolSet>) => {
          return;
        },
      });

      // Don't send empty responses to avoid Telegram API errors
      if (responseText.trim()) {
        await ctx.reply(
          `<pre>${markdownToTelegramHTML(responseText)}</pre>\n<i>${cost.toFixed(4)}$</i>`,
          {
            parse_mode: "HTML",
          },
        );
      }
      log({
        mod: "tg",
        event: "agent_response",
        response_length: responseText.length,
      });
    } catch (error) {
      await ctx.reply(
        markdownToTelegramHTML(
          "An error occurred while processing the request.",
        ),
        {
          parse_mode: "HTML",
        },
      );
      log({
        mod: "tg",
        event: "llm_error",
        message: (error as Error).message,
        trace: (error as Error).stack,
      });
    }
  };
}
