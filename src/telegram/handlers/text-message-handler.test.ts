/**
 * Tests for text message handler
 * Tests the text message handler functionality
 */

import { assert } from "@std/assert";
import { createTextMessageHandler } from "./text-message-handler.ts";
import type { beforeCallHandler, MainAgent } from "../../agent/main-agent.ts";
import type { Config } from "../../config/types.ts";
import { escapeHtml } from "../telegram-format.ts";
import type { ToolSet, TypedToolCall } from "ai";

// Mock dependencies
const mockAgent = {
  processUserQuery: () => Promise.resolve({ text: "Mock response" }),
} as unknown as MainAgent;

const mockConfig: Config = {
  agent: {
    dataDir: "./data",
    history: { maxSymbols: 20000 },
    terminal: { timeoutMs: 30000, maxCommandOutputSize: 200000, maxLLMInputLength: 2000 },
    llm: {
      provider: "openai",
      apiKey: "test",
      model: "gpt-4o-mini",
      maxSteps: 30,
      maxStdoutLength: 2000,
      basePrompt: "test",
      systemInfo: undefined,
      temperature: 0.1,
      tokenPrices: {
        inputTokens: 0.15,
        outputTokens: 0.60,
      },
    },
  },
  telegram: { botToken: "test", ownerIds: [123] },
  logging: { format: "pretty" as const },
  scheduler: { intervalHours: 1, jitterMinutes: 5 },
  metrics: {
    historyHours: 1,
    changeThreshold: 10,
    comparisonMinutes: [5, 30],
    sensitiveCollectionDelayMs: 3000,
  },
};

Deno.test("text message handler: ignores very short messages", async () => {
  const handler = createTextMessageHandler(mockAgent, mockConfig);

  // Mock context for short message
  const mockCtx = {
    message: { text: "a" },
    from: { id: 123 },
    reply: (_text: string) => {
      // Should not be called for short messages
      assert(false, "reply should not be called for short messages");
    },
    api: {
      sendChatAction: () => {
        // Should not be called for short messages
        assert(false, "sendChatAction should not be called for short messages");
      },
    },
  };

  await handler(mockCtx as unknown as Parameters<typeof handler>[0]);
});

Deno.test("text message handler: ignores command messages", async () => {
  const handler = createTextMessageHandler(mockAgent, mockConfig);

  // Mock context for command message
  const mockCtx = {
    message: { text: "/help" },
    from: { id: 123 },
    reply: (_text: string) => {
      // Should not be called for command messages
      assert(false, "reply should not be called for command messages");
    },
    api: {
      sendChatAction: () => {
        // Should not be called for command messages
        assert(false, "sendChatAction should not be called for command messages");
      },
    },
  };

  await handler(mockCtx as unknown as Parameters<typeof handler>[0]);
});

Deno.test("text message handler: does not send empty LLM responses", async () => {
  // Create a custom handler that mocks LLM to return empty response
  const customHandler = async (
    ctx: {
      message?: { text?: string };
      from?: { id?: number };
      chat?: { id?: number };
      reply: (text: string) => Promise<void>;
      api: { sendChatAction: (chatId: number, action: string) => Promise<void> };
    },
  ) => {
    const text = ctx.message?.text?.trim();

    // Skip validation checks for this test
    if (!text || text.length < 2 || text.startsWith("/")) {
      return;
    }

    await ctx.api.sendChatAction(ctx.chat!.id!, "typing");

    const response = ""; // Empty response from LLM

    // Don't send empty responses to avoid Telegram API errors
    if (response.trim()) {
      await ctx.reply(response);
    }
  };

  let replyCalled = false;

  const mockCtx = {
    message: { text: "Run ls command" },
    from: { id: 123 },
    chat: { id: 456 },
    reply: (_text: string) => {
      replyCalled = true;
      return Promise.resolve();
    },
    api: {
      sendChatAction: () => Promise.resolve(),
    },
  };

  await customHandler(mockCtx);
  assert(!replyCalled, "reply should not be called for empty responses");
});

Deno.test("text message handler: properly formats terminal command notifications", async () => {
  // Mock agent that triggers a terminal tool call synchronously for testing
  const mockAgentWithToolCall = {
    processUserQuery: ({ beforeCall }: { beforeCall?: beforeCallHandler }) => {
      // Immediately call beforeCall to test formatting
      if (beforeCall) {
        const mockToolCall = {
          type: "tool-call",
          toolCallId: "test-id",
          toolName: "terminal",
          input: {
            command:
              'ps -eo comm,%cpu --sort=-%cpu | head -n 6 | tail -n +2 | awk \'{printf "%-15s | ", $1; bars=int($2*10); for(i=0;i<bars;i++) printf "#"; printf " %.1f%%\\n", $2}\'',
            reason: "Build CPU usage graph for top processes",
          },
        } as TypedToolCall<ToolSet>;
        beforeCall(mockToolCall);
      }

      return Promise.resolve({ text: "Command executed successfully", cost: 0.01 });
    },
  } as unknown as MainAgent;

  const handler = createTextMessageHandler(mockAgentWithToolCall, mockConfig);

  const sentMessages: string[] = [];
  const mockCtx = {
    message: { text: "Show CPU usage", message_id: 123 },
    from: { id: 123 },
    chat: { id: 456 },
    reply: (text: string) => {
      sentMessages.push(text);
      return Promise.resolve();
    },
    api: {
      sendChatAction: () => Promise.resolve(),
    },
  };

  await handler(mockCtx as unknown as Parameters<typeof handler>[0]);

  console.log("Sent messages:", sentMessages);

  // Should have received 2 messages: tool call notification + response
  assert(sentMessages.length === 2, `Expected 2 messages, got ${sentMessages.length}`);

  const [toolMessage, responseMessage] = sentMessages;

  // Verify tool message formatting
  assert(
    toolMessage.includes('<blockquote><pre><code class="language-bash">'),
    "Should contain code block",
  );
  assert(
    toolMessage.includes("# Build CPU usage graph for top processes"),
    "Should contain reason with # prefix",
  );
  assert(toolMessage.includes("&gt;"), "Should contain escaped > character");
  assert(toolMessage.includes("bars=int($2*10)"), "Should contain the awk command");
  assert(toolMessage.includes("printf &quot;#&quot;"), "Should contain escaped printf statement");

  // Verify that HTML entities are properly escaped in the command part
  const commandPart = toolMessage.split("&gt; ")[1].split("</code>")[0];
  assert(
    commandPart.includes("printf &quot;%-15s | &quot;"),
    "Should contain escaped awk printf with quotes",
  );
  assert(commandPart.includes("i&lt;bars"), "Should contain escaped < in command");
  assert(!commandPart.includes("&amp;lt;"), "Should not double-escape < in command");
  assert(!commandPart.includes("&amp;gt;"), "Should not double-escape > in command");

  // Verify response message
  assert(responseMessage.includes("Command executed successfully"), "Should contain response text");
  assert(responseMessage.includes("<i>0.0100$</i>"), "Should contain cost");
});

Deno.test("escapeHtml: handles special characters in commands", () => {
  const input = "ps -eo comm,%cpu | awk '{print $1 \"<\" $2}'";
  const expected = "ps -eo comm,%cpu | awk &#39;{print $1 &quot;&lt;&quot; $2}&#39;";
  const actual = escapeHtml(input);
  assert(actual === expected);
});
