import { Message } from "grammy/types";
import type { Context } from "grammy";
import { escapeHtml, markdownToTelegramHTML as html } from "../telegram-format.ts";
import { ToolSet, TypedToolCall, TypedToolResult } from "ai";
import { withRetry } from "../../utils/retry.ts";
import { log } from "../../utils/logger.ts";
import { HtmlSplitter } from "../html-splitter.ts";

interface MessageBuilder {
  setThoughts(thoughts: string): void;
  addToolCall(toolCall: TypedToolCall<ToolSet>): void;
  addToolResult(toolResult: TypedToolResult<ToolSet>): void;
  addFinalText(finalText: string, cost: number): void;
  setError(error: Error): void;
  updateMessage(ctx: Context, telegramMessage: Message.TextMessage): Promise<void>;
}

export function createMessageBuilder(): MessageBuilder {
  let thoughtsHTML: string = "";
  const toolCallHTMLs: string[] = [];
  let finalTextHTML: string = "...";
  let finalCost: number = 0;
  let errorHTML: string = "";
  let lastUpdatedContent: string = "";
  let currentMessage: Message.TextMessage | null = null;
  const builder = {
    setThoughts: (thoughts: string) => {
      thoughtsHTML = html(thoughts);
    },
    addToolCall: (call: TypedToolCall<ToolSet>) => {
      switch (call.toolName) {
        case "terminal": {
          const reasonHTML = html(call.input.reason.replace(/\n/g, "\n# "));
          toolCallHTMLs.push(
            `# ${reasonHTML}\n&gt; ${escapeHtml(call.input.command)}`,
          );
          break;
        }
        default: {
          toolCallHTMLs.push(
            `<blockquote>${call.toolName}: ${
              JSON.stringify(
                call.input,
              )
            }</blockquote>`,
          );
          break;
        }
      }
    },
    addToolResult: (_toolResult: TypedToolResult<ToolSet>) => {},
    addFinalText: (finalText: string, cost: number) => {
      finalTextHTML = html(finalText);
      finalCost = cost;
    },
    setError: (error: Error) => {
      errorHTML = escapeHtml(error.message);
    },
    updateMessage: async (ctx: Context, telegramMessage: Message.TextMessage) => {
      // Initialize current message on first call
      if (!currentMessage) {
        currentMessage = telegramMessage;
      }

      const parts: string[] = [];

      // Add thoughts section if present
      if (thoughtsHTML) {
        parts.push(`<blockquote>\n${thoughtsHTML}\n</blockquote>`);
      }

      // Add tool calls section if present
      if (toolCallHTMLs.length > 0) {
        parts.push(
          `<blockquote><pre><code class="language-bash">\n${
            toolCallHTMLs.join("\n")
          }\n</code></pre></blockquote>`,
        );
      }

      // Add final text
      if (finalTextHTML && finalTextHTML !== "...") {
        parts.push(finalTextHTML);
      }

      // Add error if present
      if (errorHTML) {
        parts.push(`<b>Error:</b> ${errorHTML}`);
      }

      // Add cost if present
      if (finalCost > 0) {
        parts.push(`<i>${finalCost.toFixed(4)}$</i>`);
      }

      const newContent = parts.join("\n");

      // Telegram message length limit is 4096 characters
      const MAX_MESSAGE_LENGTH = 4096;

      if (newContent.length > MAX_MESSAGE_LENGTH) {
        const splitter = new HtmlSplitter(MAX_MESSAGE_LENGTH);
        const chunks = splitter.split(newContent);

        if (chunks.length > 0) {
          const firstPart = chunks[0];

          if (firstPart !== lastUpdatedContent) {
            log({
              mod: "tg",
              event: "edit_message_text",
              message_id: currentMessage!.message_id,
              text_length: firstPart.length,
              text: firstPart,
            });
            await withRetry(
              () =>
                ctx.api.editMessageText(
                  currentMessage!.chat.id,
                  currentMessage!.message_id,
                  firstPart,
                  { parse_mode: "HTML" },
                ),
              { opName: "editMessageText" },
            );
            lastUpdatedContent = firstPart;
          }

          // Send remaining content as new message(s)
          for (let i = 1; i < chunks.length; i++) {
            const chunk = chunks[i];
            log({
              mod: "tg",
              event: "send_message",
              chat_id: currentMessage!.chat.id,
              text_length: chunk.length,
              text: chunk,
            });
            const sentMessage = await withRetry(
              () =>
                ctx.api.sendMessage(
                  currentMessage!.chat.id,
                  chunk,
                  { parse_mode: "HTML" },
                ),
              { opName: "sendMessage" },
            );

            // Switch to the new message as current
            currentMessage = sentMessage as Message.TextMessage;
            lastUpdatedContent = chunk;
          }
        }
      } else {
        // Content fits in one message
        if (newContent === lastUpdatedContent) {
          return;
        }
        lastUpdatedContent = newContent;
        log({
          mod: "tg",
          event: "edit_message_text",
          message_id: currentMessage!.message_id,
          text_length: newContent.length,
          text: newContent,
        });
        await withRetry(
          () =>
            ctx.api.editMessageText(
              currentMessage!.chat.id,
              currentMessage!.message_id,
              newContent,
              { parse_mode: "HTML" },
            ),
          { opName: "editMessageText" },
        );
      }
    },
  } as MessageBuilder;
  return builder;
}
