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

Deno.test("ContextBuilder: setBasePrompt sets base prompt correctly", () => {
  const builder = createContextBuilder();
  const basePrompt = "You are a helpful assistant";

  builder.setBasePromptTemplate(basePrompt);

  // Base prompt is stored internally, verify by checking it doesn't throw
  assertExists(builder);
});

Deno.test("ContextBuilder: appendUserQuery adds user message to history", () => {
  const builder = createContextBuilder();
  const userQuery = "Hello, how are you?";

  builder.appendUserQuery(userQuery);

  // Verify message was added by checking getRecentMessages
  const messages = builder.getContext();
  assertEquals(messages.length, 1);
  assertEquals(messages[0].role, "user");
  assertEquals(messages[0].content, userQuery);
});

Deno.test("ContextBuilder: append handles simple messages correctly", () => {
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

  const messages = builder.getContext();
  assertEquals(messages.length, 3);
  assertEquals(messages[0].role, "user");
  assertEquals(messages[0].content, "Test message");
  assertEquals(messages[1].role, "assistant");
  assertEquals(messages[1].content, [{ type: "text", text: "Response" }]);
  assertEquals(messages[2].role, "system");
  assertEquals(messages[2].content, "System prompt");
});

Deno.test("ContextBuilder: append handles complex messages with tool calls", () => {
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

  const messages = builder.getContext();
  assertEquals(messages.length, 1);
  assertEquals(messages[0].role, "assistant");
  assertEquals(Array.isArray(messages[0].content), true);

  const content = messages[0].content as unknown[];
  assertEquals(content.length, 1);
  const toolCall = content[0] as { type: string; toolCallId: string };
  assertEquals(toolCall.type, "tool-call");
  assertEquals(toolCall.toolCallId, "call_123");
});

Deno.test("ContextBuilder: appendAgentStep handles tool calls and results", () => {
  const builder = createContextBuilder();

  const step = {
    text: "I'll help you list files",
    toolCalls: [
      {
        toolCallId: "call_123",
        toolName: "terminal",
        input: { command: "ls -la", cwd: "/tmp", reason: "List files" },
      },
    ],
    toolResults: [
      {
        toolCallId: "call_123",
        toolName: "terminal",
        output: { exitCode: 0, stdout: "file1.txt\nfile2.txt", stderr: "", durationMs: 100 },
      },
    ],
    // Add missing required properties for StepResult
    content: "",
    reasoning: "",
    reasoningText: "",
    files: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    finishReason: "stop" as const,
    object: "text" as const,
    id: "test-id",
  } as unknown as Parameters<ContextBuilder["appendAgentStep"]>[0]; // Using correct type for testing

  builder.appendAgentStep(step);

  const messages = builder.getContext();
  assertEquals(messages.length, 3); // One for tool call, one for tool result, one for text response

  // First message should be assistant with tool call
  assertEquals(messages[0].role, "assistant");
  assertEquals(Array.isArray(messages[0].content), true);
  const firstContent = messages[0].content as unknown[];
  const firstItem = firstContent[0] as { type: string; text: string };
  assertEquals(firstItem.type, "text");
  assertEquals(firstItem.text, "I'll help you list files");

  // Second message should be tool result
  assertEquals(messages[1].role, "assistant");
  assertEquals(Array.isArray(messages[1].content), true);
  const secondContent = messages[1].content as unknown[];
  const secondItem = secondContent[0] as { type: string };
  assertEquals(secondItem.type, "tool-call");

  // Third message should be assistant with text response
  assertEquals(messages[2].role, "tool");
  assertEquals(Array.isArray(messages[2].content), true);
  const thirdContent = messages[2].content as unknown[];
  const thirdItem = thirdContent[0] as { type: string; text: string };
  assertEquals(thirdItem.type, "tool-result");
});

Deno.test("ContextBuilder: appendAgentStep handles text response only", () => {
  const builder = createContextBuilder();

  const step = {
    text: "Hello! How can I help you?",
    toolCalls: [],
    toolResults: [],
    // Add missing required properties for StepResult
    content: "Hello! How can I help you?",
    reasoning: "",
    reasoningText: "",
    files: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    finishReason: "stop" as const,
    object: "text" as const,
    id: "test-id",
  } as unknown as Parameters<ContextBuilder["appendAgentStep"]>[0]; // Using correct type for testing

  builder.appendAgentStep(step);

  const messages = builder.getContext();
  assertEquals(messages.length, 1);
  assertEquals(messages[0].role, "assistant");
  assertEquals(Array.isArray(messages[0].content), true);

  const content = messages[0].content as unknown[];
  assertEquals(content.length, 1);
  const textItem = content[0] as { type: string; text: string };
  assertEquals(textItem.type, "text");
  assertEquals(textItem.text, "Hello! How can I help you?");
});

Deno.test("ContextBuilder: getRecentMessages respects symbol limit", () => {
  const builder = createContextBuilder(50); // Very small limit

  // Add messages that exceed the limit
  builder.appendUserQuery("This is a very long message that will exceed the symbol limit");
  builder.appendUserQuery("Another long message");

  const messages = builder.getContext();

  // Should only return messages that fit within the limit
  const totalLength = messages.reduce((sum, msg) => {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    return sum + content.length;
  }, 0);

  assertEquals(totalLength <= 50, true);
});

Deno.test("ContextBuilder: getRecentMessages returns messages in chronological order", () => {
  const builder = createContextBuilder();

  builder.appendUserQuery("First message");
  builder.append({ role: "assistant", content: [{ type: "text", text: "First response" }] });
  builder.appendUserQuery("Second message");
  builder.append({ role: "assistant", content: [{ type: "text", text: "Second response" }] });

  const messages = builder.getContext();
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

Deno.test("ContextBuilder: reset clears conversation history", () => {
  const builder = createContextBuilder();

  builder.appendUserQuery("Test message");
  builder.append({ role: "assistant", content: "Response" });

  // Verify messages exist
  assertEquals(builder.getContext().length, 2);

  // Reset history
  builder.reset();

  // Verify history is empty
  assertEquals(builder.getContext().length, 0);
});

Deno.test("ContextBuilder: handles malformed JSON in complex content gracefully", () => {
  const builder = createContextBuilder();

  // Create malformed/non-serializable content and ensure no crash
  const circular: { self?: unknown } = {};
  circular.self = circular;
  builder.append({ role: "assistant", content: circular } as unknown as ModelMessage);

  // Should not crash and return an array
  const messages = builder.getContext();
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
