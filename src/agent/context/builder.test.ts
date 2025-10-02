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

  // Test message with tool call content and corresponding tool result
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

  const toolResultMessage = {
    role: "tool" as const,
    content: [
      {
        type: "tool-result" as const,
        toolCallId: "call_123",
        toolName: "terminal",
        output: {
          type: "json" as const,
          value: { exitCode: 0, stdout: "file1.txt\nfile2.txt", stderr: "" },
        },
      },
    ],
  };

  builder.append(toolCallMessage);
  builder.append(toolResultMessage);

  const { messages } = await builder.getContext("You are a helpful assistant");
  assertEquals(messages.length, 2);
  assertEquals(messages[0].role, "assistant");
  assertEquals(messages[1].role, "tool");
  assertEquals(Array.isArray(messages[0].content), true);
  assertEquals(Array.isArray(messages[1].content), true);

  const assistantContent = messages[0].content as unknown[];
  const toolContent = messages[1].content as unknown[];
  assertEquals(assistantContent.length, 1);
  assertEquals(toolContent.length, 1);
  const toolCall = assistantContent[0] as { type: string; toolCallId: string };
  assertEquals(toolCall.type, "tool-call");
  assertEquals(toolCall.toolCallId, "call_123");
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

Deno.test("ContextBuilder: integration with ContextCompactor ensures tool-call/tool-result consistency", async () => {
  const maxSymbols = 300; // Small limit to force trimming
  const builder = new ContextBuilder(maxSymbols, createMockSystemInfo(), new MockFactsStorage());

  // Add many messages to exceed limit
  for (let i = 0; i < 10; i++) {
    builder.append({ role: "user", content: `User message ${i} with some content` });
    builder.append({ role: "assistant", content: `Assistant response ${i}` });
  }

  // Add tool-call and tool-result at the end (most recent)
  const toolCallId = "important_call";
  builder.append({
    role: "assistant",
    content: [{
      type: "tool-call",
      toolCallId,
      toolName: "terminal",
      input: { command: "pwd" },
    }],
  });

  builder.append({
    role: "tool",
    content: [{
      type: "tool-result",
      toolCallId,
      toolName: "terminal",
      output: { type: "json", value: { exitCode: 0, stdout: "/home/user", stderr: "" } },
    }],
  });

  const { messages } = await builder.getContext("You are a helpful assistant");

  // Verify consistency: if tool-result is present, tool-call must also be present
  const hasToolResult = messages.some((m: ModelMessage) =>
    m.role === "tool" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "type" in c &&
      (c as { type: string }).type === "tool-result"
    )
  );

  const hasToolCall = messages.some((m: ModelMessage) =>
    m.role === "assistant" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "type" in c &&
      (c as { type: string }).type === "tool-call"
    )
  );

  if (hasToolResult) {
    assertEquals(
      hasToolCall,
      true,
      "Tool-call must be present when tool-result is present in trimmed context",
    );
  }

  // Verify that total symbol count is within limit
  let totalSymbols = 0;
  const compactor = new (await import("./compactor.ts")).SimpleContextCompactor(maxSymbols);
  for (const msg of messages) {
    totalSymbols += compactor.estimateSymbols(msg);
  }
  assertEquals(
    totalSymbols <= maxSymbols,
    true,
    `Total symbols ${totalSymbols} should not exceed limit ${maxSymbols}`,
  );
});

Deno.test("ContextBuilder: handles orphaned tool-call removal during context trimming", async () => {
  const maxSymbols = 200; // Small limit
  const builder = new ContextBuilder(maxSymbols, createMockSystemInfo(), new MockFactsStorage());

  // Add messages to consume symbol budget
  for (let i = 0; i < 5; i++) {
    builder.append({ role: "user", content: `User message ${i} with considerable content` });
    builder.append({ role: "assistant", content: `Assistant response ${i} with more content` });
  }

  // Add orphaned tool-call (no corresponding tool-result)
  builder.append({
    role: "assistant",
    content: [{
      type: "tool-call",
      toolCallId: "orphaned_call",
      toolName: "terminal",
      input: { command: "pwd" },
    }],
  });

  const { messages } = await builder.getContext("You are a helpful assistant");

  // Orphaned tool-call should be removed by consistency check
  const hasOrphanedToolCall = messages.some((m: ModelMessage) =>
    m.role === "assistant" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "type" in c &&
      (c as { type: string }).type === "tool-call" &&
      "toolCallId" in c && (c as { toolCallId: string }).toolCallId === "orphaned_call"
    )
  );

  assertEquals(
    hasOrphanedToolCall,
    false,
    "Orphaned tool-call should be removed from trimmed context",
  );
});

Deno.test("ContextBuilder: preserves system prompt templating with server info and facts", async () => {
  const builder = new ContextBuilder(1000, createMockSystemInfo(), new MockFactsStorage());

  const template =
    "System: {{SERVER_INFO}}\nFacts: {{FACTS}}\nInstructions: You are a helpful assistant.";

  const { systemPrompt } = await builder.getContext(template);

  // Verify that placeholders are replaced
  assertEquals(
    systemPrompt.includes("{{SERVER_INFO}}"),
    false,
    "SERVER_INFO placeholder should be replaced",
  );
  assertEquals(systemPrompt.includes("{{FACTS}}"), false, "FACTS placeholder should be replaced");
  assertEquals(systemPrompt.includes("System:"), true, "System prompt should contain system info");
  assertEquals(systemPrompt.includes("Facts:"), true, "System prompt should contain facts");
  assertEquals(
    systemPrompt.includes("Instructions:"),
    true,
    "System prompt should preserve instructions",
  );
});
