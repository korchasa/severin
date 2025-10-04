import { Message } from "grammy/types";
import type { Context } from "grammy";
import { escapeHtml, markdownToTelegramHTML as html } from "../telegram-format.ts";
import { ToolSet, TypedToolCall, TypedToolResult } from "ai";

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
  let finalTextHTML: string = "";
  let finalCost: number = 0;
  let errorHTML: string;
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
      errorHTML = html(error.message);
    },
    updateMessage: async (ctx: Context, telegramMessage: Message.TextMessage) => {
      await ctx.api.editMessageText(
        telegramMessage.chat.id,
        telegramMessage.message_id,
        `
<blockquote expandable>
${thoughtsHTML}
---
${toolCallHTMLs.join("\n")}
</blockquote>
${finalTextHTML}
${errorHTML ? `<b>Error:</b> ${errorHTML}` : ""}
<i>${finalCost.toFixed(4)}$</i>
`.trim(),
      );
    },
  };
  return builder;
}
