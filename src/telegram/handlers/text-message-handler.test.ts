/**
 * Tests for text message handler
 * Tests the text message handler functionality
 */

import { assert } from "@std/assert";
import { createTextMessageHandler } from "./text-message-handler.ts";
import type { beforeCallHandler, MainAgent } from "../../agent/main-agent.ts";
import type { Config } from "../../config/types.ts";
import type { ToolSet, TypedToolCall, TypedToolResult } from "ai";
import { escapeHtml } from "../telegram-format.ts";

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
      editMessageText: () => {
        // Should not be called for short messages
        assert(false, "editMessageText should not be called for short messages");
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
      editMessageText: () => {
        // Should not be called for command messages
        assert(false, "editMessageText should not be called for command messages");
      },
    },
  };

  await handler(mockCtx as unknown as Parameters<typeof handler>[0]);
});

Deno.test("text message handler: does not update message for empty LLM responses", async () => {
  // Mock agent that returns empty response
  const mockAgentEmptyResponse = {
    processUserQuery: () => Promise.resolve({ text: "", cost: 0.01 }),
  } as unknown as MainAgent;

  const handler = createTextMessageHandler(mockAgentEmptyResponse, mockConfig);

  let editMessageTextCalled = false;
  let replyCalled = false;

  const mockCtx = {
    message: { text: "Run ls command", message_id: 123 },
    from: { id: 123 },
    chat: { id: 456 },
    reply: (_text: string, _opts?: unknown) => {
      replyCalled = true;
      return Promise.resolve({ message_id: 456 } as any);
    },
    api: {
      sendChatAction: () => Promise.resolve(),
      editMessageText: () => {
        editMessageTextCalled = true;
        return Promise.resolve();
      },
    },
  };

  await handler(mockCtx as unknown as Parameters<typeof handler>[0]);

  // Reply should be called to create initial message
  assert(replyCalled, "reply should be called to create initial message");
  // But editMessageText should not be called for empty response (final text not added)
  assert(!editMessageTextCalled, "editMessageText should not be called for empty responses");
});

Deno.test("text message handler: properly formats terminal command notifications", async () => {
  // Mock agent that triggers a terminal tool call and returns result
  const mockAgentWithToolCall = {
    processUserQuery: ({ onThoughts, beforeCall, afterCall }: {
      onThoughts?: (thoughts: string) => Promise<void>;
      beforeCall?: beforeCallHandler;
      afterCall?: (result: TypedToolResult<ToolSet>) => Promise<void>;
    }) => {
      // Call onThoughts to test thoughts formatting
      if (onThoughts) {
        onThoughts("Analyzing CPU usage request");
      }

      // Call beforeCall to test tool call formatting
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

      // Call afterCall to test tool result formatting
      if (afterCall) {
        const mockToolResult = {
          type: "tool-result",
          toolCallId: "test-id",
          toolName: "terminal",
          input: { command: "ps aux", reason: "Check processes" },
          output: "top 5 processes by CPU usage...",
        } as unknown as TypedToolResult<ToolSet>;
        afterCall(mockToolResult);
      }

      return Promise.resolve({ text: "Command executed successfully", cost: 0.01 });
    },
  } as unknown as MainAgent;

  const handler = createTextMessageHandler(mockAgentWithToolCall, mockConfig);

  const editMessageCalls: string[] = [];
  let replyCalled = false;
  let replyText = "";

  const mockCtx = {
    message: { text: "Show CPU usage", message_id: 123 },
    from: { id: 123 },
    chat: { id: 456 },
    reply: (text: string, _opts?: unknown) => {
      replyCalled = true;
      replyText = text;
      return Promise.resolve({ message_id: 789, chat: { id: 456 } } as any);
    },
    api: {
      sendChatAction: () => Promise.resolve(),
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        editMessageCalls.push(text);
        return Promise.resolve();
      },
    },
  };

  await handler(mockCtx as unknown as Parameters<typeof handler>[0]);

  // Should have called reply once to create initial message
  assert(replyCalled, "reply should be called to create initial message");
  assert(replyText === "...", "initial reply should be '...'");

  // Should have called editMessageText multiple times as MessageBuilder updates
  assert(editMessageCalls.length > 0, "editMessageText should be called at least once");

  const finalMessage = editMessageCalls[editMessageCalls.length - 1];

  // Verify thoughts are included
  assert(finalMessage.includes("Analyzing CPU usage request"), "Should contain thoughts");

  // Verify tool call formatting
  assert(finalMessage.includes("# Build CPU usage graph for top processes"), "Should contain reason with # prefix");
  assert(finalMessage.includes("&gt;"), "Should contain escaped > character");
  assert(finalMessage.includes("bars=int($2*10)"), "Should contain the awk command");

  // Verify that HTML entities are properly escaped in the command part
  const commandPart = finalMessage.split("&gt; ")[1]?.split("\n")[0];
  assert(commandPart, "Should contain command part");
  assert(commandPart.includes("printf &quot;%-15s | &quot;"), "Should contain escaped awk printf with quotes");
  assert(commandPart.includes("i&lt;bars"), "Should contain escaped < in command");

  // Verify final response and cost
  assert(finalMessage.includes("Command executed successfully"), "Should contain response text");
  assert(finalMessage.includes("<i>0.0100$</i>"), "Should contain cost");
});

Deno.test("text message handler: handles errors properly", async () => {
  // Mock agent that throws an error
  const mockAgentError = {
    processUserQuery: () => {
      throw new Error("Test error occurred");
    },
  } as unknown as MainAgent;

  const handler = createTextMessageHandler(mockAgentError, mockConfig);

  const editMessageCalls: string[] = [];
  let replyCalled = false;

  const mockCtx = {
    message: { text: "Test query", message_id: 123 },
    from: { id: 123 },
    chat: { id: 456 },
    reply: (_text: string, _opts?: unknown) => {
      replyCalled = true;
      return Promise.resolve({ message_id: 789, chat: { id: 456 } } as any);
    },
    api: {
      sendChatAction: () => Promise.resolve(),
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        editMessageCalls.push(text);
        return Promise.resolve();
      },
    },
  };

  await handler(mockCtx as unknown as Parameters<typeof handler>[0]);

  // Should have called reply once to create initial message
  assert(replyCalled, "reply should be called to create initial message");

  // Should have called editMessageText to show error
  assert(editMessageCalls.length > 0, "editMessageText should be called for error");

  const finalMessage = editMessageCalls[editMessageCalls.length - 1];

  // Verify error is included
  assert(finalMessage.includes("<b>Error:</b>"), "Should contain error prefix");
  assert(finalMessage.includes("Test error occurred"), "Should contain error message");
});

Deno.test("text message handler: processes normal queries correctly", async () => {
  // Mock agent with normal response
  const mockAgentNormal = {
    processUserQuery: ({ onThoughts }: { onThoughts?: (thoughts: string) => Promise<void> }) => {
      if (onThoughts) {
        onThoughts("Processing your request");
      }
      return Promise.resolve({ text: "Hello, this is a normal response", cost: 0.005 });
    },
  } as unknown as MainAgent;

  const handler = createTextMessageHandler(mockAgentNormal, mockConfig);

  const editMessageCalls: string[] = [];
  let replyCalled = false;

  const mockCtx = {
    message: { text: "Hello bot", message_id: 123 },
    from: { id: 123 },
    chat: { id: 456 },
    reply: (_text: string, _opts?: unknown) => {
      replyCalled = true;
      return Promise.resolve({ message_id: 789, chat: { id: 456 } } as any);
    },
    api: {
      sendChatAction: () => Promise.resolve(),
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        editMessageCalls.push(text);
        return Promise.resolve();
      },
    },
  };

  await handler(mockCtx as unknown as Parameters<typeof handler>[0]);

  // Should have called reply once to create initial message
  assert(replyCalled, "reply should be called to create initial message");

  // Should have called editMessageText at least once
  assert(editMessageCalls.length >= 1, "editMessageText should be called at least once");

  const finalMessage = editMessageCalls[editMessageCalls.length - 1];

  // Verify thoughts are included
  assert(finalMessage.includes("Processing your request"), "Should contain thoughts");

  // Verify final response and cost
  assert(finalMessage.includes("Hello, this is a normal response"), "Should contain response text");
  assert(finalMessage.includes("<i>0.0050$</i>"), "Should contain cost");
});

Deno.test("escapeHtml: handles special characters in commands", () => {
  const input = "ps -eo comm,%cpu | awk '{print $1 \"<\" $2}'";
  const expected = "ps -eo comm,%cpu | awk &#39;{print $1 &quot;&lt;&quot; $2}&#39;";
  const actual = escapeHtml(input);
  assert(actual === expected);
});
