/**
 * Tests for message builder
 * Tests the message builder functionality
 */

import { assert, assertEquals } from "@std/assert";
import { createMessageBuilder } from "./message-builder.ts";
import type { ToolSet, TypedToolCall, TypedToolResult } from "ai";
import type { Context } from "grammy";
import type { Message } from "grammy/types";

Deno.test("message builder: builds thoughts correctly", () => {
  const builder = createMessageBuilder();

  builder.setThoughts("Analyzing user request for system information");

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        assert(
          text.includes("Analyzing user request for system information"),
          "Should contain thoughts",
        );
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  builder.updateMessage(mockCtx as unknown as Context, mockMessage);
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
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  builder.updateMessage(mockCtx as unknown as Context, mockMessage);
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
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  builder.updateMessage(mockCtx as unknown as Context, mockMessage);
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

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  builder.updateMessage(mockCtx as unknown as Context, mockMessage);
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

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  builder.updateMessage(mockCtx as unknown as Context, mockMessage);
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
        // Should contain thoughts
        assert(text.includes("Processing user query"), "Should contain thoughts");

        // Should contain tool call
        assert(text.includes("# Check running processes"), "Should contain tool reason");
        assert(text.includes("&gt; ps aux"), "Should contain tool command");

        // Should contain final text
        assert(text.includes("Here are the running processes"), "Should contain final text");

        // Should contain cost
        assert(text.includes("<i>0.0080$</i>"), "Should contain cost");

        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  builder.updateMessage(mockCtx as unknown as Context, mockMessage);
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

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  builder.updateMessage(mockCtx as unknown as Context, mockMessage);
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
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  builder.updateMessage(mockCtx as unknown as Context, mockMessage);
});

Deno.test("message builder: splits long messages correctly", async () => {
  const builder = createMessageBuilder();

  // Create a long final text that exceeds 4096 characters
  const longText = "A".repeat(5000);
  builder.addFinalText(longText, 0.01);

  let editCallCount = 0;
  let sendCallCount = 0;
  const receivedMessages: string[] = [];

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        editCallCount++;
        receivedMessages.push(text);
        assert(
          text.length <= 4096,
          `Edit message should not exceed 4096 chars, got ${text.length}`,
        );
        assert(text.includes("... (continued)"), "First part should have continuation marker");
        return Promise.resolve();
      },
      sendMessage: (_chatId: number, text: string) => {
        sendCallCount++;
        receivedMessages.push(text);
        assert(
          text.length <= 4096,
          `Send message should not exceed 4096 chars, got ${text.length}`,
        );
        return Promise.resolve(
          { chat: { id: 123 }, message_id: 789 + sendCallCount } as Message.TextMessage,
        );
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);

  assert(editCallCount === 1, `Should call editMessageText once, got ${editCallCount}`);
  assert(sendCallCount >= 1, `Should call sendMessage at least once, got ${sendCallCount}`);
  assert(
    receivedMessages.length >= 2,
    `Should create at least 2 messages, got ${receivedMessages.length}`,
  );
});

Deno.test("message builder: handles exactly 4096 characters", async () => {
  const builder = createMessageBuilder();

  // Create text that's exactly 4096 characters
  const exactText = "B".repeat(4096);
  builder.addFinalText(exactText, 0);

  let editCallCount = 0;
  let sendCallCount = 0;

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        editCallCount++;
        assert(text.length <= 4096, `Message should not exceed 4096 chars, got ${text.length}`);
        return Promise.resolve();
      },
      sendMessage: (_chatId: number, _text: string) => {
        sendCallCount++;
        return Promise.resolve({ chat: { id: 123 }, message_id: 789 } as Message.TextMessage);
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);

  assert(editCallCount === 1, "Should call editMessageText once");
  assert(sendCallCount === 0, "Should not call sendMessage for exact limit");
});

Deno.test("message builder: switches active message after split", async () => {
  const builder = createMessageBuilder();

  // First update with long text (exceeds limit)
  const longText1 = "C".repeat(5000);
  builder.addFinalText(longText1, 0.01);

  const sentMessages: Array<{ chatId: number; messageId: number; text: string }> = [];
  let lastSentMessageId = 456;

  const mockCtx = {
    api: {
      editMessageText: (chatId: number, messageId: number, text: string) => {
        sentMessages.push({ chatId, messageId, text });
        return Promise.resolve();
      },
      sendMessage: (chatId: number, text: string) => {
        lastSentMessageId++;
        sentMessages.push({ chatId, messageId: lastSentMessageId, text });
        return Promise.resolve(
          { chat: { id: chatId }, message_id: lastSentMessageId } as Message.TextMessage,
        );
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  // First update - should split
  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);

  const messagesAfterFirstUpdate = sentMessages.length;
  assert(messagesAfterFirstUpdate >= 2, "Should have at least 2 messages after first update");

  // Second update with short text (should update the last sent message)
  const shortText = "Short update";
  builder.addFinalText(shortText, 0.02);

  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);

  // Should update the last message from the previous split
  const lastMessage = sentMessages[sentMessages.length - 1];
  assert(lastMessage.messageId === lastSentMessageId, "Should update the last sent message");
  assert(lastMessage.text.includes(shortText), "Should contain the new short text");
});

Deno.test("message builder: handles error escaping correctly", async () => {
  const builder = createMessageBuilder();

  // Error with special HTML characters and backticks
  builder.setError(new Error("Can't parse `<code>` tag properly"));

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        assert(text.includes("<b>Error:</b>"), "Should have error prefix");
        assert(text.includes("Can&#39;t parse"), "Should escape apostrophe");
        assert(text.includes("`&lt;code&gt;`"), "Should escape HTML tags inside backticks");
        assert(!text.includes("<code>`"), "Should not have unescaped code tags");
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);
});

Deno.test("message builder: doesn't update if content hasn't changed", async () => {
  const builder = createMessageBuilder();

  builder.addFinalText("Same text", 0.01);

  let callCount: number = 0;

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, _text: string) => {
        callCount++;
        return Promise.resolve();
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  // First call
  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);
  assertEquals(callCount, 1, "Should call once on first update");

  // Second call with same content
  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);
  assertEquals(callCount, 1, "Should not call again if content hasn't changed");

  // Third call with different content
  builder.addFinalText("Different text", 0.02);
  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);
  assertEquals(callCount, 2, "Should call again when content changes");
});

Deno.test("message builder: handles multiple splits correctly", async () => {
  const builder = createMessageBuilder();

  // Create text that requires 3 messages (> 8192 chars)
  const veryLongText = "D".repeat(10000);
  builder.addFinalText(veryLongText, 0.05);

  let editCallCount = 0;
  let sendCallCount = 0;

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        editCallCount++;
        assert(text.length <= 4096, `Edit message too long: ${text.length}`);
        return Promise.resolve();
      },
      sendMessage: (_chatId: number, text: string) => {
        sendCallCount++;
        assert(text.length <= 4096, `Send message too long: ${text.length}`);
        return Promise.resolve(
          { chat: { id: 123 }, message_id: 500 + sendCallCount } as Message.TextMessage,
        );
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);

  assert(editCallCount === 1, "Should edit original message once");
  assert(sendCallCount >= 2, `Should send at least 2 new messages, got ${sendCallCount}`);
});

Deno.test("message builder: doesn't split HTML tags", async () => {
  const builder = createMessageBuilder();

  // Create content with HTML tags that would be split if we don't handle it properly
  const textWithTags = "<b>" + "A".repeat(4050) + "</b><code>" + "B".repeat(100) + "</code>";
  builder.addFinalText(textWithTags, 0.01);

  const receivedMessages: string[] = [];

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        receivedMessages.push(text);
        // Verify no broken tags in first part
        assert(
          !text.includes("<b>A") || text.includes("</b>") || text.includes("... (continued)"),
          "First part should not have unclosed <b> tag",
        );
        return Promise.resolve();
      },
      sendMessage: (_chatId: number, text: string) => {
        receivedMessages.push(text);
        return Promise.resolve({ chat: { id: 123 }, message_id: 789 } as Message.TextMessage);
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);

  // Check all messages for valid HTML structure
  for (const msg of receivedMessages) {
    const openBrackets = (msg.match(/</g) || []).length;
    const closeBrackets = (msg.match(/>/g) || []).length;

    // Count of < and > should be equal (accounting for entities like &lt;)
    // This is a simple check - more sophisticated validation could be added
    assert(
      openBrackets === closeBrackets,
      `Message should have balanced brackets: ${openBrackets} open, ${closeBrackets} close`,
    );
  }
});

Deno.test("message builder: doesn't split HTML entities", async () => {
  const builder = createMessageBuilder();

  // Create content with HTML entities near the split boundary
  const prefix = "A".repeat(4060);
  const entities = "&lt;tag&gt; &amp; &quot;text&quot; &#39;quote&#39;";
  builder.addFinalText(prefix + entities, 0.01);

  const receivedMessages: string[] = [];

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        receivedMessages.push(text);
        return Promise.resolve();
      },
      sendMessage: (_chatId: number, text: string) => {
        receivedMessages.push(text);
        return Promise.resolve({ chat: { id: 123 }, message_id: 789 } as Message.TextMessage);
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);

  // Check that no message contains broken entities (e.g., "&lt" without ";")
  for (const msg of receivedMessages) {
    // Remove the continuation marker to check the actual content
    const content = msg.replace("... (continued)", "");

    // Check for broken entities: & followed by letters but not terminated with ;
    const brokenEntityPattern = /&[a-z#]+(?![a-z0-9]*;)/i;
    assert(
      !brokenEntityPattern.test(content),
      `Message should not contain broken HTML entities: ${msg.substring(msg.length - 50)}`,
    );
  }
});

Deno.test("message builder: closes and reopens tags when splitting", async () => {
  const builder = createMessageBuilder();

  // Create content with nested tags that will be split
  const longContent = "<b>Bold text " + "A".repeat(4070) + " more bold</b>";
  builder.addFinalText(longContent, 0.01);

  const receivedMessages: string[] = [];

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        receivedMessages.push(text);
        return Promise.resolve();
      },
      sendMessage: (_chatId: number, text: string) => {
        receivedMessages.push(text);
        return Promise.resolve({ chat: { id: 123 }, message_id: 789 } as Message.TextMessage);
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);

  assert(receivedMessages.length === 2, "Should split into 2 messages");

  const firstMsg = receivedMessages[0].replace("\n\n<i>... (continued)</i>", "");
  const secondMsg = receivedMessages[1];

  // First message should close the <b> tag before ending
  assert(
    firstMsg.endsWith("</b>") || firstMsg.includes("</b>"),
    "First message should close the <b> tag",
  );

  // Second message should reopen the <b> tag at the start
  assert(
    secondMsg.startsWith("<b>") || secondMsg.includes("<b>"),
    "Second message should reopen the <b> tag",
  );
});

Deno.test("message builder: handles multiple nested tags when splitting", async () => {
  const builder = createMessageBuilder();

  // Create content with multiple nested tags
  const longContent = "<b><i>Bold italic " + "X".repeat(4060) + " continues</i></b>";
  builder.addFinalText(longContent, 0.01);

  const receivedMessages: string[] = [];

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        receivedMessages.push(text);
        return Promise.resolve();
      },
      sendMessage: (_chatId: number, text: string) => {
        receivedMessages.push(text);
        return Promise.resolve({ chat: { id: 123 }, message_id: 789 } as Message.TextMessage);
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);

  assert(receivedMessages.length === 2, "Should split into 2 messages");

  const firstMsg = receivedMessages[0].replace("\n\n<i>... (continued)</i>", "");
  const secondMsg = receivedMessages[1];

  // First message should close both tags in reverse order
  assert(
    firstMsg.includes("</i>") && firstMsg.includes("</b>"),
    "First message should close both nested tags",
  );

  // Second message should reopen both tags in original order
  assert(
    secondMsg.includes("<b>") && secondMsg.includes("<i>"),
    "Second message should reopen both nested tags",
  );
});

Deno.test("message builder: preserves tag order when reopening", async () => {
  const builder = createMessageBuilder();

  // Create content: <b><code>text</code> more <i>text</i></b>
  const prefix = "<b><code>code " + "A".repeat(4040) + "</code> after code <i>italic text</i></b>";
  builder.addFinalText(prefix, 0.01);

  const receivedMessages: string[] = [];

  const mockCtx = {
    api: {
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        receivedMessages.push(text);
        return Promise.resolve();
      },
      sendMessage: (_chatId: number, text: string) => {
        receivedMessages.push(text);
        return Promise.resolve({ chat: { id: 123 }, message_id: 789 } as Message.TextMessage);
      },
    },
  };

  const mockMessage = { chat: { id: 123 }, message_id: 456 } as Message.TextMessage;

  await builder.updateMessage(mockCtx as unknown as Context, mockMessage);

  // Verify each message has balanced tags
  for (const msg of receivedMessages) {
    const cleanMsg = msg.replace("\n\n<i>... (continued)</i>", "");

    // Count opening and closing tags
    const openB = (cleanMsg.match(/<b>/g) || []).length;
    const closeB = (cleanMsg.match(/<\/b>/g) || []).length;
    const openI = (cleanMsg.match(/<i>/g) || []).length;
    const closeI = (cleanMsg.match(/<\/i>/g) || []).length;
    const openCode = (cleanMsg.match(/<code>/g) || []).length;
    const closeCode = (cleanMsg.match(/<\/code>/g) || []).length;

    assert(
      openB === closeB,
      `Message should have balanced <b> tags: ${openB} open, ${closeB} close`,
    );
    assert(
      openI === closeI,
      `Message should have balanced <i> tags: ${openI} open, ${closeI} close`,
    );
    assert(
      openCode === closeCode,
      `Message should have balanced <code> tags: ${openCode} open, ${closeCode} close`,
    );
  }
});
