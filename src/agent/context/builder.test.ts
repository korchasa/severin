/**
 * Tests for ContextBuilder
 * Tests conversation history management with symbol-based limiting
 */

import { assertEquals, assertExists } from "@std/assert";
import { ContextBuilder } from "./builder.ts";
import { MockFactsStorage } from "../facts/mock.ts";
import { createMockSystemInfo } from "../../system-info/mock.ts";
import { ModelMessage } from "ai";

function createContextBuilder(maxSymbols = 1000): ContextBuilder {
  return new ContextBuilder(maxSymbols, createMockSystemInfo(), new MockFactsStorage());
}

Deno.test("ContextBuilder: constructor initializes with correct parameters", () => {
  const maxSymbols = 500;
  const systemInfo = createMockSystemInfo();
  const factsStorage = new MockFactsStorage();

  const builder = new ContextBuilder(maxSymbols, systemInfo, factsStorage);

  // Verify constructor parameters are stored
  assertExists(builder);
});

Deno.test("ContextBuilder: append handles simple messages correctly", async () => {
  const builder = createContextBuilder();

  // Test user message
  const userMessage = { role: "user" as const, content: "Test message" };
  builder.append(userMessage);

  // Test assistant message
  const assistantMessage = { role: "assistant" as const, content: "Response" };
  builder.append(assistantMessage);

  // Test system message
  const systemMessage = { role: "system" as const, content: "System prompt" };
  builder.append(systemMessage);

  const { messages } = await builder.getContext("You are a helpful assistant");
  assertEquals(messages.length, 3);
  assertEquals(messages[0].role, "user");
  assertEquals(messages[0].content, "Test message");
  assertEquals(messages[1].role, "assistant");
  assertEquals(messages[1].content, "Response");
  assertEquals(messages[2].role, "system");
  assertEquals(messages[2].content, "System prompt");
});

Deno.test("ContextBuilder: append handles complex messages with tool calls", async () => {
  const builder = createContextBuilder();

  // Test message with tool call content
  const toolCallMessage = {
    role: "assistant" as const,
    content: [
      {
        type: "tool-call" as const,
        toolCallId: "call_123",
        toolName: "terminal",
        input: { command: "ls" },
      },
    ],
  };

  builder.append(toolCallMessage);

  const { messages } = await builder.getContext("You are a helpful assistant");
  assertEquals(messages.length, 1);
  assertEquals(messages[0].role, "assistant");
  assertEquals(Array.isArray(messages[0].content), true);

  const content = messages[0].content as unknown[];
  assertEquals(content.length, 1);
  const toolCall = content[0] as { type: string; toolCallId: string };
  assertEquals(toolCall.type, "tool-call");
  assertEquals(toolCall.toolCallId, "call_123");
});

Deno.test("ContextBuilder: getRecentMessages respects symbol limit", async () => {
  const builder = createContextBuilder(50); // Very small limit

  // Add messages that exceed the limit
  builder.append({
    role: "user",
    content: "This is a very long message that will exceed the symbol limit",
  });
  builder.append({ role: "user", content: "Another long message" });

  const { messages } = await builder.getContext("You are a helpful assistant");

  // Should only return messages that fit within the limit
  const totalLength = messages.reduce((sum, msg) => {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    return sum + content.length;
  }, 0);

  assertEquals(totalLength <= 50, true);
});

Deno.test("ContextBuilder: getRecentMessages returns messages in chronological order", async () => {
  const builder = createContextBuilder();

  builder.append({ role: "user", content: "First message" });
  builder.append({ role: "assistant", content: [{ type: "text", text: "First response" }] });
  builder.append({ role: "user", content: "Second message" });
  builder.append({ role: "assistant", content: [{ type: "text", text: "Second response" }] });

  const { messages } = await builder.getContext("You are a helpful assistant");
  assertEquals(messages.length, 4);
  assertEquals(messages[0].role, "user");
  assertEquals(messages[0].content, "First message");
  assertEquals(messages[1].role, "assistant");
  assertEquals(messages[1].content, [{ type: "text", text: "First response" }]);
  assertEquals(messages[2].role, "user");
  assertEquals(messages[2].content, "Second message");
  assertEquals(messages[3].role, "assistant");
  assertEquals(messages[3].content, [{ type: "text", text: "Second response" }]);
});

Deno.test("ContextBuilder: reset clears conversation history", async () => {
  const builder = createContextBuilder();

  builder.append({ role: "user", content: "Test message" });
  builder.append({ role: "assistant", content: "Response" });

  // Verify messages exist
  const { messages } = await builder.getContext("You are a helpful assistant");
  assertEquals(messages.length, 2);

  // Reset history
  builder.reset();

  // Verify history is empty
  const { messages: newMessages } = await builder.getContext("You are a helpful assistant");
  assertEquals(newMessages.length, 0);
});

Deno.test("ContextBuilder: handles malformed JSON in complex content gracefully", async () => {
  const builder = createContextBuilder();

  // Create malformed/non-serializable content and ensure no crash
  const circular: { self?: unknown } = {};
  circular.self = circular;
  builder.append({ role: "assistant", content: circular } as unknown as ModelMessage);

  // Should not crash and return an array
  const { messages } = await builder.getContext("You are a helpful assistant");
  assertEquals(Array.isArray(messages), true);
});

Deno.test("ContextBuilder: estimateSymbols handles different content types", () => {
  const builder = createContextBuilder();

  // Test string content
  const stringMessage = { role: "user" as const, content: "Hello world" };
  const stringSymbols = (builder as unknown as { estimateSymbols: (msg: unknown) => number })
    .estimateSymbols(stringMessage);
  assertEquals(stringSymbols, 11); // "Hello world".length

  // Test complex content
  const complexMessage = {
    role: "assistant" as const,
    content: [{ type: "tool-call", toolCallId: "123" }],
  };
  const complexSymbols = (builder as unknown as { estimateSymbols: (msg: unknown) => number })
    .estimateSymbols(complexMessage);
  assertEquals(typeof complexSymbols, "number");
  assertEquals(complexSymbols > 0, true);
});

Deno.test("ContextBuilder: appendStepMessages deduplicates messages by content", async () => {
  const builder = createContextBuilder();

  // First message step.response.messages (from example)
  const firstStepMessages = [
    {
      role: "assistant" as const,
      content: [
        {
          type: "text" as const,
          text:
            "**Plan:** Execute the `pwd` command to print the current working directory.\n\n**Commands:**\n```bash\npwd\n```\n\nExecuting now.",
        },
        {
          type: "tool-call" as const,
          toolCallId: "call_usodqn0VYdFkGOuxhstDIjPE",
          toolName: "terminal",
          input: {
            command: "pwd",
            reason: "User requested to run pwd to show current directory",
          },
        },
      ],
    },
    {
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolCallId: "call_usodqn0VYdFkGOuxhstDIjPE",
          toolName: "terminal",
          output: { type: "json" as const, value: {} },
        },
      ],
    },
  ];

  // Second message step.response.messages (from example) - contains duplicates + new message
  const secondStepMessages = [
    {
      role: "assistant" as const,
      content: [
        {
          type: "text" as const,
          text:
            "**Plan:** Execute the `pwd` command to print the current working directory.\n\n**Commands:**\n```bash\npwd\n```\n\nExecuting now.",
        },
        {
          type: "tool-call" as const,
          toolCallId: "call_usodqn0VYdFkGOuxhstDIjPE",
          toolName: "terminal",
          input: {
            command: "pwd",
            reason: "User requested to run pwd to show current directory",
          },
        },
      ],
    },
    {
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolCallId: "call_usodqn0VYdFkGOuxhstDIjPE",
          toolName: "terminal",
          output: { type: "json" as const, value: {} },
        },
      ],
    },
    {
      role: "assistant" as const,
      content: [
        {
          type: "text" as const,
          text: "Current working directory: /",
        },
      ],
    },
  ];

  // Add first set of messages
  builder.appendStepMessages(firstStepMessages);
  let { messages } = await builder.getContext("You are a helpful assistant");
  assertEquals(messages.length, 2, "Should have 2 unique messages after first step");

  // Add second set of messages (with duplicates)
  builder.appendStepMessages(secondStepMessages);
  ({ messages } = await builder.getContext("You are a helpful assistant"));
  assertEquals(
    messages.length,
    3,
    "Should have 3 unique messages after second step (2 old + 1 new)",
  );

  // Verify that new messages are indeed unique
  // Count assistant messages with textual content
  const assistantMessages = messages.filter((m: ModelMessage) => m.role === "assistant");
  assertEquals(assistantMessages.length, 2, "Should have 2 unique assistant messages");

  // Verify presence of unique texts
  const hasPlanMessage = messages.some((m: ModelMessage) =>
    m.role === "assistant" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "text" in c &&
      (c as { text: string }).text.includes("Execute the `pwd` command")
    )
  );
  const hasResultMessage = messages.some((m: ModelMessage) =>
    m.role === "assistant" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "text" in c &&
      (c as { text: string }).text.includes("Current working directory")
    )
  );

  assertEquals(hasPlanMessage, true, "Should contain the plan message");
  assertEquals(hasResultMessage, true, "Should contain the result message");
});
