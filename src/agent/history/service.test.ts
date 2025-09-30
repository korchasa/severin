import { assertEquals } from "@std/assert";
import { ConversationHistory } from "./service.ts";

Deno.test("conversation history: getRecentMessages respects symbol limit", () => {
  // Create a conversation history for testing
  const conversationHistory = new ConversationHistory();

  // Add messages with known lengths
  conversationHistory.append({ role: "user", content: "Hello" }); // 5 chars
  conversationHistory.append({ role: "assistant", content: "Hi there" }); // 8 chars
  conversationHistory.append({ role: "user", content: "How are you doing today?" }); // 23 chars

  // Get recent messages with limit of 15 chars
  const context = conversationHistory.getRecentMessages(15);
  assertEquals(context.length, 2); // Should fit "Hello" (5) + "Hi there" (8) = 13 chars
  assertEquals(context[0].content, "Hello"); // Oldest first
  assertEquals(context[1].content, "Hi there");
});

Deno.test("conversation history: getRecentMessages with large limit", () => {
  const conversationHistory = new ConversationHistory();

  conversationHistory.append({ role: "user", content: "Hello" });
  conversationHistory.append({ role: "assistant", content: "Hi there" });

  // Large limit should return all messages
  const context = conversationHistory.getRecentMessages(100);
  assertEquals(context.length, 2);
  assertEquals(context[0].content, "Hello");
  assertEquals(context[1].content, "Hi there");
});

Deno.test("conversation history: getRecentMessages with small limit", () => {
  const conversationHistory = new ConversationHistory();

  conversationHistory.append({
    role: "user",
    content: "Very long message that exceeds the limit",
  });
  conversationHistory.append({ role: "assistant", content: "Short" });

  // Small limit should return only the most recent message that fits
  const context = conversationHistory.getRecentMessages(10);
  assertEquals(context.length, 1);
  assertEquals(context[0].content, "Short");
});

Deno.test("conversation history: reset messages", () => {
  const conversationHistory = new ConversationHistory();

  conversationHistory.append({ role: "user", content: "Hello" });

  assertEquals(conversationHistory.getRecentMessages(1000).length, 1);

  conversationHistory.reset();
  assertEquals(conversationHistory.getRecentMessages(1000).length, 0);
});
