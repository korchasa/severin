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
import { TerminalRequest } from "../../core/types.ts";
import { z } from "zod";
import { AddFactParams, DeleteFactParams, UpdateFactParams } from "../../agent/tools/facts.ts";
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
        "mod": "tg",
        "event": "text_message_ignored",
        "reason": "too_short",
        "length": userQuery?.length || 0,
      });
      return;
    }

    // Skip messages that start with / (commands are handled separately)
    if (userQuery.startsWith("/")) {
      return;
    }

    // Log the text message being sent to LLM
    log({
      "mod": "tg",
      "event": "text_message_to_llm",
      "text_length": userQuery.length,
    });

    // Send typing action to show the bot is processing
    await ctx.api.sendChatAction(ctx.chat!.id, "typing");

    const msg = await ctx.reply("...");

    try {
      // Process query through agent
      const { text: responseText } = await mainAgent.processUserQuery({
        userQuery: userQuery,
        correlationId: msg.message_id?.toString(),
        onThoughts: async (thoughts) => {
          await ctx.reply(
            markdownToTelegramHTML(
              `<blockquote expandable><pre><code class="language-bash"># ${thoughts}</code></pre></blockquote>`,
            ),
            { parse_mode: "HTML" },
          );
        },
        beforeCall: async (call: TypedToolCall<ToolSet>) => {
          switch (call.toolName) {
            case "terminal": {
              const params = call.input as TerminalRequest;
              const reason = params.reason.replace(/\n/g, "\n# ");
              await ctx.reply(
                markdownToTelegramHTML(
                  `<blockquote expandable><pre><code class="language-bash"># ${reason}\n&gt; ${params.command}</code></pre></blockquote>`,
                ),
                { parse_mode: "HTML" },
              );
              break;
            }
            case "add_fact": {
              const params = call.input as z.infer<typeof AddFactParams>;
              await ctx.reply(
                markdownToTelegramHTML(
                  `<blockquote>Add fact "${params.content}"</blockquote>`,
                ),
                { parse_mode: "HTML" },
              );
              break;
            }
            case "update_fact": {
              const params = call.input as z.infer<typeof UpdateFactParams>;
              await ctx.reply(
                markdownToTelegramHTML(
                  `<blockquote>Update fact "${params.content}"</blockquote>`,
                ),
                { parse_mode: "HTML" },
              );
              break;
            }
            case "delete_fact": {
              const params = call.input as z.infer<typeof DeleteFactParams>;
              await ctx.reply(
                markdownToTelegramHTML(
                  `<blockquote>Delete fact "${params.id}"</blockquote>`,
                ),
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
        await ctx.reply(markdownToTelegramHTML(responseText), { parse_mode: "HTML" });
      }
      log({
        "mod": "tg",
        "event": "agent_response",
        "response_length": responseText.length,
      });
    } catch (error) {
      await ctx.reply(
        markdownToTelegramHTML("An error occurred while processing the request."),
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

interface messageParts {
  callThoughts: string;
  toTelegram: (text: string) => void;
}
