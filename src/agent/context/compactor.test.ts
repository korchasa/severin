/**
 * Tests for SimpleContextCompactor
 * Tests message trimming and tool-call/tool-result consistency
 */

import { assertEquals } from "@std/assert";
import { SimpleContextCompactor } from "./compactor.ts";
import { ModelMessage } from "ai";

Deno.test("ContextCompactor: trims messages by symbol limit", () => {
  const compactor = new SimpleContextCompactor(50); // Small limit

  const messages: ModelMessage[] = [
    { role: "user", content: "Short message" },
    { role: "assistant", content: "This is a longer message that should exceed the limit" },
    { role: "user", content: "Another message" },
  ];

  const result = compactor.compact(messages);

  // Should trim to fit within limit, keeping most recent messages
  // "Another message" (15 chars) fits, "longer message" (54 chars) doesn't fit with it
  assertEquals(result.length, 1);
  assertEquals(result[0].role, "user");
  assertEquals(result[0].content, "Another message");
});

Deno.test("ContextCompactor: preserves tool-call/tool-result consistency", () => {
  const compactor = new SimpleContextCompactor(1000);

  const toolCallId = "call_123";
  const messages: ModelMessage[] = [
    {
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId,
        toolName: "terminal",
        input: { command: "pwd" },
      }],
    },
    {
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId,
        toolName: "terminal",
        output: { type: "json", value: { exitCode: 0, stdout: "/home/user", stderr: "" } },
      }],
    },
  ];

  const result = compactor.compact(messages);

  // Should preserve both messages since they're consistent
  assertEquals(result.length, 2);
  assertEquals(result[0].role, "assistant");
  assertEquals(result[1].role, "tool");
});

Deno.test("ContextCompactor: removes orphaned tool-result", () => {
  const compactor = new SimpleContextCompactor(1000);

  const messages: ModelMessage[] = [
    {
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: "orphaned_call",
        toolName: "terminal",
        output: { type: "json", value: { exitCode: 0, stdout: "/home/user", stderr: "" } },
      }],
    },
  ];

  const result = compactor.compact(messages);

  // Should remove orphaned tool-result
  assertEquals(result.length, 0);
});

Deno.test("ContextCompactor: removes orphaned tool-call", () => {
  const compactor = new SimpleContextCompactor(1000);

  const messages: ModelMessage[] = [
    {
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId: "orphaned_call",
        toolName: "terminal",
        input: { command: "pwd" },
      }],
    },
  ];

  const result = compactor.compact(messages);

  // Should remove orphaned tool-call
  assertEquals(result.length, 0);
});

Deno.test("ContextCompactor: handles mixed consistent and orphaned messages", () => {
  const compactor = new SimpleContextCompactor(1000);

  const consistentId = "consistent_call";
  const orphanedId = "orphaned_call";

  const messages: ModelMessage[] = [
    { role: "user", content: "Regular message" },
    {
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId: consistentId,
        toolName: "terminal",
        input: { command: "pwd" },
      }],
    },
    {
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: consistentId,
        toolName: "terminal",
        output: { type: "json", value: { exitCode: 0, stdout: "/home/user", stderr: "" } },
      }],
    },
    {
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId: orphanedId,
        toolName: "terminal",
        input: { command: "ls" },
      }],
    },
  ];

  const result = compactor.compact(messages);

  // Should keep regular message and consistent tool pair, remove orphaned tool-call
  assertEquals(result.length, 3);
  assertEquals(result[0].role, "user");
  assertEquals(result[1].role, "assistant");
  assertEquals(result[2].role, "tool");
});

Deno.test("ContextCompactor: trims messages by symbol limit", () => {
  const compactor = new SimpleContextCompactor(50); // Very small limit

  const messages: ModelMessage[] = [
    { role: "user", content: "This is a very long message that will exceed the symbol limit" },
    { role: "user", content: "Another long message" },
  ];

  const result = compactor.compact(messages);

  // Should only return messages that fit within the limit
  const totalLength = result.reduce((sum, msg) => {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    return sum + content.length;
  }, 0);

  assertEquals(totalLength <= 50, true);
});

Deno.test("ContextCompactor: handles malformed JSON in complex content gracefully", () => {
  const compactor = new SimpleContextCompactor(1000);

  // Create malformed/non-serializable content and ensure no crash
  const circular: { self?: unknown } = {};
  circular.self = circular;
  const messages: ModelMessage[] = [
    { role: "assistant", content: circular } as unknown as ModelMessage,
  ];

  // Should not crash and return an array
  const result = compactor.compact(messages);
  assertEquals(Array.isArray(result), true);
});

Deno.test("ContextCompactor: trimming preserves tool-call/tool-result consistency", () => {
  const compactor = new SimpleContextCompactor(200); // Small limit to force trimming

  // Add many messages to exceed limit
  const messages: ModelMessage[] = [];
  for (let i = 0; i < 10; i++) {
    messages.push({ role: "user", content: `User message ${i}` });
    messages.push({ role: "assistant", content: `Assistant response ${i}` });
  }

  // Add tool-call and tool-result messages at the end
  const toolCallId = "call_123";
  const assistantWithToolCall: ModelMessage = {
    role: "assistant",
    content: [{
      type: "tool-call",
      toolCallId,
      toolName: "terminal",
      input: { command: "pwd" },
    }],
  };

  const toolResult: ModelMessage = {
    role: "tool",
    content: [{
      type: "tool-result",
      toolCallId,
      toolName: "terminal",
      output: { type: "json", value: { exitCode: 0, stdout: "/home/user", stderr: "" } },
    }],
  };

  messages.push(assistantWithToolCall);
  messages.push(toolResult);

  const result = compactor.compact(messages);

  // Check that if tool-result is present, tool-call is also present
  const hasToolResult = result.some((m: ModelMessage) =>
    m.role === "tool" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "type" in c &&
      (c as { type: string }).type === "tool-result"
    )
  );

  const hasToolCall = result.some((m: ModelMessage) =>
    m.role === "assistant" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "type" in c &&
      (c as { type: string }).type === "tool-call"
    )
  );

  // If tool-result is present, tool-call must also be present (consistency check)
  if (hasToolResult) {
    assertEquals(hasToolCall, true, "Tool-call must be present if tool-result is present");
  }
});

Deno.test("ContextCompactor: trimming removes tool-result when tool-call is trimmed away", () => {
  const compactor = new SimpleContextCompactor(150); // Very small limit to force aggressive trimming

  // Add many messages to exceed limit significantly
  const messages: ModelMessage[] = [];
  for (let i = 0; i < 15; i++) {
    messages.push({
      role: "user",
      content: `User message ${i} with some extra content to consume space`,
    });
    messages.push({ role: "assistant", content: `Assistant response ${i} with more content` });
  }

  // Add tool-call and tool-result messages at the very end
  const toolCallId = "call_trimmed";
  const assistantWithToolCall: ModelMessage = {
    role: "assistant",
    content: [{
      type: "tool-call",
      toolCallId,
      toolName: "terminal",
      input: { command: "pwd" },
    }],
  };

  const toolResult: ModelMessage = {
    role: "tool",
    content: [{
      type: "tool-result",
      toolCallId,
      toolName: "terminal",
      output: { type: "json", value: { exitCode: 0, stdout: "/home/user", stderr: "" } },
    }],
  };

  messages.push(assistantWithToolCall);
  messages.push(toolResult);

  const result = compactor.compact(messages);

  // Check that neither tool-call nor tool-result are present in the trimmed context
  const hasToolCall = result.some((m: ModelMessage) =>
    m.role === "assistant" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "type" in c &&
      (c as { type: string }).type === "tool-call"
    )
  );

  const hasToolResult = result.some((m: ModelMessage) =>
    m.role === "tool" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "type" in c &&
      (c as { type: string }).type === "tool-result"
    )
  );

  // Since both tool-call and tool-result should be trimmed away due to space constraints,
  // and they are linked, neither should be present
  assertEquals(hasToolCall, false, "Tool-call should not be present when trimmed away");
  assertEquals(
    hasToolResult,
    false,
    "Tool-result should not be present when its tool-call is trimmed away",
  );
});

Deno.test("ContextCompactor: trimming removes orphaned tool-result when tool-call is not included", () => {
  const compactor = new SimpleContextCompactor(300); // Small limit

  // Add some messages
  const messages: ModelMessage[] = [];
  for (let i = 0; i < 5; i++) {
    messages.push({ role: "user", content: `User message ${i} with some content` });
    messages.push({ role: "assistant", content: `Assistant response ${i}` });
  }

  // Add tool-call (this might be trimmed)
  const toolCallId = "call_orphaned";
  const assistantWithToolCall: ModelMessage = {
    role: "assistant",
    content: [{
      type: "tool-call",
      toolCallId,
      toolName: "terminal",
      input: { command: "pwd" },
    }],
  };

  messages.push(assistantWithToolCall);

  // Add more messages to push tool-call towards trimming
  for (let i = 6; i < 12; i++) {
    messages.push({
      role: "user",
      content: `User message ${i} with additional content to consume space`,
    });
    messages.push({ role: "assistant", content: `Assistant response ${i} with more content` });
  }

  // Add tool-result at the very end (this should be removed if tool-call is trimmed)
  const toolResult: ModelMessage = {
    role: "tool",
    content: [{
      type: "tool-result",
      toolCallId,
      toolName: "terminal",
      output: { type: "json", value: { exitCode: 0, stdout: "/home/user", stderr: "" } },
    }],
  };

  messages.push(toolResult);

  const result = compactor.compact(messages);

  // Check consistency: if tool-result is present, tool-call must also be present
  const hasToolResult = result.some((m: ModelMessage) =>
    m.role === "tool" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "type" in c &&
      (c as { type: string }).type === "tool-result"
    )
  );

  const hasToolCall = result.some((m: ModelMessage) =>
    m.role === "assistant" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "type" in c &&
      (c as { type: string }).type === "tool-call"
    )
  );

  // Tool-result should not exist without its corresponding tool-call
  if (hasToolResult) {
    assertEquals(hasToolCall, true, "If tool-result exists, tool-call must also exist");
  }
});

Deno.test("ContextCompactor: estimateSymbols handles different content types", () => {
  const compactor = new SimpleContextCompactor(1000);

  // Test string content
  const stringMessage = { role: "user" as const, content: "Hello world" };
  const stringSymbols = compactor.estimateSymbols(stringMessage);
  assertEquals(stringSymbols, 11); // "Hello world".length

  // Test complex content
  const complexMessage = {
    role: "assistant" as const,
    content: [{ type: "tool-call" as const, toolCallId: "123", toolName: "test", input: {} }],
  };
  const complexSymbols = compactor.estimateSymbols(complexMessage);
  assertEquals(typeof complexSymbols, "number");
  assertEquals(complexSymbols > 0, true);
});

Deno.test("ContextCompactor: handles assistant message with mixed tool-call consistency", () => {
  const compactor = new SimpleContextCompactor(1000);

  const consistentId = "consistent_call";
  const orphanedId = "orphaned_call";

  const messages: ModelMessage[] = [
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "I'll run two commands",
        },
        {
          type: "tool-call",
          toolCallId: consistentId,
          toolName: "terminal",
          input: { command: "pwd" },
        },
        {
          type: "tool-call",
          toolCallId: orphanedId,
          toolName: "terminal",
          input: { command: "ls" },
        },
      ],
    },
    {
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: consistentId,
        toolName: "terminal",
        output: { type: "json", value: { exitCode: 0, stdout: "/home/user", stderr: "" } },
      }],
    },
  ];

  const result = compactor.compact(messages);

  // Should remove entire assistant message because it contains both consistent and orphaned tool-calls
  assertEquals(result.length, 1); // Only the tool-result message remains
  assertEquals(result[0].role, "tool");
  assertEquals(Array.isArray(result[0].content), true);
});

Deno.test("ContextCompactor: preserves consistency over symbol limit when trimming", () => {
  const compactor = new SimpleContextCompactor(100); // Very small limit

  const toolCallId = "important_call";
  const messages: ModelMessage[] = [
    // Add many messages to exceed limit
    { role: "user", content: "Message 1 with some content" },
    { role: "assistant", content: "Response 1" },
    { role: "user", content: "Message 2 with some content" },
    { role: "assistant", content: "Response 2" },
    // Tool messages at the end (most recent)
    {
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId,
        toolName: "terminal",
        input: { command: "pwd" },
      }],
    },
    {
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId,
        toolName: "terminal",
        output: { type: "json", value: { exitCode: 0, stdout: "/home/user", stderr: "" } },
      }],
    },
  ];

  const result = compactor.compact(messages);

  // Even with small limit, consistent tool-call/tool-result pair should be preserved
  // because consistency check happens after trimming
  const hasToolCall = result.some((m: ModelMessage) =>
    m.role === "assistant" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "type" in c &&
      (c as { type: string }).type === "tool-call"
    )
  );

  const hasToolResult = result.some((m: ModelMessage) =>
    m.role === "tool" &&
    Array.isArray(m.content) &&
    m.content.some((c: unknown) =>
      typeof c === "object" && c !== null && "type" in c &&
      (c as { type: string }).type === "tool-result"
    )
  );

  // If tool-result is present, tool-call must also be present (consistency requirement)
  if (hasToolResult) {
    assertEquals(hasToolCall, true, "Tool-call must be present when tool-result is present");
  }
});

Deno.test("ContextCompactor: handles tool message with multiple tool-results", () => {
  const compactor = new SimpleContextCompactor(1000);

  const consistentId = "consistent_call";
  const orphanedId = "orphaned_call";

  const messages: ModelMessage[] = [
    {
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId: consistentId,
        toolName: "terminal",
        input: { command: "pwd" },
      }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: consistentId,
          toolName: "terminal",
          output: { type: "json", value: { exitCode: 0, stdout: "/home/user", stderr: "" } },
        },
        {
          type: "tool-result",
          toolCallId: orphanedId,
          toolName: "terminal",
          output: { type: "json", value: { exitCode: 0, stdout: "/tmp", stderr: "" } },
        },
      ],
    },
  ];

  const result = compactor.compact(messages);

  // Should remove entire tool message because it contains both consistent and orphaned tool-results
  assertEquals(result.length, 1); // Only the assistant message remains
  assertEquals(result[0].role, "assistant");
});

Deno.test("ContextCompactor: consistency check preserves non-tool messages regardless of tool consistency", () => {
  const compactor = new SimpleContextCompactor(1000);

  const messages: ModelMessage[] = [
    { role: "system", content: "System prompt" },
    { role: "user", content: "User message" },
    { role: "assistant", content: "Assistant response" },
    {
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId: "orphaned_call",
        toolName: "terminal",
        input: { command: "pwd" },
      }],
    },
  ];

  const result = compactor.compact(messages);

  // Should keep all non-tool messages, remove only orphaned tool-call message
  assertEquals(result.length, 3);
  assertEquals(result[0].role, "system");
  assertEquals(result[1].role, "user");
  assertEquals(result[2].role, "assistant");
  assertEquals(result[2].content, "Assistant response");
});

Deno.test("ContextCompactor: handles empty content arrays gracefully", () => {
  const compactor = new SimpleContextCompactor(1000);

  const messages: ModelMessage[] = [
    { role: "assistant", content: [] }, // Empty content array
    { role: "tool", content: [] }, // Empty content array
    { role: "user", content: "Regular message" },
  ];

  const result = compactor.compact(messages);

  // Should keep all messages including those with empty content arrays
  assertEquals(result.length, 3);
});

Deno.test("ContextCompactor: handles non-array content in tool roles", () => {
  const compactor = new SimpleContextCompactor(1000);

  const messages: ModelMessage[] = [
    { role: "tool", content: [] }, // Empty array instead of string, but still invalid for tool role
    { role: "user", content: "Regular message" },
  ];

  // Should not crash and return messages
  const result = compactor.compact(messages);
  assertEquals(Array.isArray(result), true);
  assertEquals(result.length, 2);
});
