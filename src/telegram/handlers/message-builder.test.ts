/**
 * Tests for message builder
 * Tests the message builder functionality
 */

import { assert } from "@std/assert";
import { createMessageBuilder } from "./message-builder.ts";
import type { ToolSet, TypedToolCall, TypedToolResult } from "ai";

Deno.test("message builder: builds thoughts correctly", () => {
  const builder = createMessageBuilder();

  builder.setThoughts("Analyzing user request for system information");

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        assert(text.includes("Analyzing user request for system information"), "Should contain thoughts");
        assert(text.includes("<blockquote expandable>"), "Should have expandable blockquote");
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as any;

  builder.updateMessage(mockCtx as any, mockMessage);
});

Deno.test("message builder: builds terminal tool calls correctly", () => {
  const builder = createMessageBuilder();

  const mockToolCall: TypedToolCall<ToolSet> = {
    type: "tool-call",
    toolCallId: "test-123",
    toolName: "terminal",
    input: {
      command: "ls -la",
      reason: "List directory contents",
    },
  };

  builder.addToolCall(mockToolCall);

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        assert(text.includes("# List directory contents"), "Should contain reason with # prefix");
        assert(text.includes("&gt; ls -la"), "Should contain escaped command");
        assert(text.includes("<blockquote expandable>"), "Should have expandable blockquote wrapper");
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as any;

  builder.updateMessage(mockCtx as any, mockMessage);
});

Deno.test("message builder: builds generic tool calls correctly", () => {
  const builder = createMessageBuilder();

  const mockToolCall: TypedToolCall<ToolSet> = {
    type: "tool-call",
    toolCallId: "test-123",
    toolName: "facts",
    input: {
      query: "system info",
    },
  };

  builder.addToolCall(mockToolCall);

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        assert(text.includes("facts:"), "Should contain tool name");
        assert(text.includes('{"query":"system info"}'), "Should contain input JSON");
        assert(text.includes("<blockquote expandable>"), "Should have expandable blockquote wrapper");
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as any;

  builder.updateMessage(mockCtx as any, mockMessage);
});

Deno.test("message builder: builds final text correctly", () => {
  const builder = createMessageBuilder();

  builder.addFinalText("Command executed successfully", 0.0125);

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        assert(text.includes("Command executed successfully"), "Should contain final text");
        assert(text.includes("<i>0.0125$</i>"), "Should contain formatted cost");
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as any;

  builder.updateMessage(mockCtx as any, mockMessage);
});

Deno.test("message builder: builds error messages correctly", () => {
  const builder = createMessageBuilder();

  builder.setError(new Error("Network timeout occurred"));

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        assert(text.includes("<b>Error:</b>"), "Should contain error prefix");
        assert(text.includes("Network timeout occurred"), "Should contain error message");
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as any;

  builder.updateMessage(mockCtx as any, mockMessage);
});

Deno.test("message builder: combines all parts correctly", () => {
  const builder = createMessageBuilder();

  // Add thoughts
  builder.setThoughts("Processing user query");

  // Add tool call
  const mockToolCall: TypedToolCall<ToolSet> = {
    type: "tool-call",
    toolCallId: "test-123",
    toolName: "terminal",
    input: {
      command: "ps aux",
      reason: "Check running processes",
    },
  };
  builder.addToolCall(mockToolCall);

  // Add final text
  builder.addFinalText("Here are the running processes", 0.008);

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        // Check that all parts are present in the correct order
        const lines = text.trim().split("\n");

        // Should start with blockquote expandable
        assert(lines[0].includes("<blockquote expandable>"), "Should start with expandable blockquote");

        // Should contain thoughts
        assert(text.includes("Processing user query"), "Should contain thoughts");

        // Should contain tool call separator
        assert(text.includes("---"), "Should contain separator");

        // Should contain tool call
        assert(text.includes("# Check running processes"), "Should contain tool reason");
        assert(text.includes("&gt; ps aux"), "Should contain tool command");

        // Should close blockquote
        assert(text.includes("</blockquote>"), "Should close blockquote");

        // Should contain final text
        assert(text.includes("Here are the running processes"), "Should contain final text");

        // Should contain cost
        assert(text.includes("<i>0.0080$</i>"), "Should contain cost");

        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as any;

  builder.updateMessage(mockCtx as any, mockMessage);
});

Deno.test("message builder: handles multiple tool calls", () => {
  const builder = createMessageBuilder();

  // Add first tool call
  const mockToolCall1: TypedToolCall<ToolSet> = {
    type: "tool-call",
    toolCallId: "test-1",
    toolName: "terminal",
    input: {
      command: "ls",
      reason: "List files",
    },
  };
  builder.addToolCall(mockToolCall1);

  // Add second tool call
  const mockToolCall2: TypedToolCall<ToolSet> = {
    type: "tool-call",
    toolCallId: "test-2",
    toolName: "facts",
    input: {
      query: "cpu usage",
    },
  };
  builder.addToolCall(mockToolCall2);

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        assert(text.includes("# List files"), "Should contain first tool reason");
        assert(text.includes("&gt; ls"), "Should contain first tool command");
        assert(text.includes("facts:"), "Should contain second tool name");
        assert(text.includes('{"query":"cpu usage"}'), "Should contain second tool input");
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as any;

  builder.updateMessage(mockCtx as any, mockMessage);
});

Deno.test("message builder: handles tool results (no-op)", () => {
  const builder = createMessageBuilder();

  const mockToolResult: TypedToolResult<ToolSet> = {
    type: "tool-result",
    toolCallId: "test-123",
    toolName: "terminal",
    input: { command: "ls", reason: "list files" },
    output: "Command output here",
  } as unknown as TypedToolResult<ToolSet>;

  // addToolResult should not throw and should be no-op
  builder.addToolResult(mockToolResult);

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        // Since addToolResult is no-op, tool results should not appear in message
        assert(!text.includes("Command output here"), "Should not contain tool output");
        // But should still have the blockquote structure
        assert(text.includes("<blockquote expandable>"), "Should have expandable blockquote wrapper");
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as any;

  builder.updateMessage(mockCtx as any, mockMessage);
});
