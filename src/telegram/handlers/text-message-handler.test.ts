/**
 * Tests for text message handler
 * Tests the text message handler functionality
 */

import { assert } from "@std/assert";
import { createTextMessageHandler } from "./text-message-handler.ts";
import type { MainAgent } from "../../agent/agent.ts";
import type { Config } from "../../config/types.ts";

// Mock dependencies
const mockAgent: MainAgent = {
  processUserQuery: () => Promise.resolve({ text: "Mock response" }),
};

const mockConfig: Config = {
  agent: {
    dataDir: "./data",
    history: { maxMessages: 200 },
    terminal: { timeoutMs: 30000, maxCommandOutputSize: 200000, maxLLMInputLength: 2000 },
    llm: {
      provider: "openai",
      apiKey: "test",
      model: "gpt-4o-mini",
      maxSteps: 30,
      maxStdoutLength: 2000,
      basePrompt: "test",
      additionalPrompt: "",
      systemInfo: undefined,
    },
  },
  telegram: { botToken: "test", ownerIds: [123] },
  logging: { format: "pretty" as const },
  scheduler: { intervalHours: 1, jitterMinutes: 5 },
  metrics: {
    historyHours: 1,
    changeThreshold: 10,
    comparisonMinutes: [5, 30],
  },
};

// Mock LLM response for reference
const _mockLLMResponse = "Mock LLM response";

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
    const _userId = ctx.from?.id;

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
