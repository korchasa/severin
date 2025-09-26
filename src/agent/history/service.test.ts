import { assertEquals } from "@std/assert";
import { ConversationHistory } from "./service.ts";

Deno.test("conversation history: append and trim messages", () => {
  // Create a conversation history for testing
  const conversationHistory = new ConversationHistory(2);

  // Add messages
  conversationHistory.appendMessage("user", "Hello");
  conversationHistory.appendMessage("assistant", "Hi there");

  let context = conversationHistory.getContext();
  assertEquals(context.length, 2);

  // Add third message - should trim to 2
  conversationHistory.appendMessage("user", "How are you?");

  context = conversationHistory.getContext();
  assertEquals(context.length, 2);
  assertEquals(context[0].content, "Hi there");
  assertEquals(context[1].content, "How are you?");
});

Deno.test("conversation history: reset messages", () => {
  const conversationHistory = new ConversationHistory(200);

  conversationHistory.appendMessage("user", "Hello");

  assertEquals(conversationHistory.getContext().length, 1);

  conversationHistory.reset();
  assertEquals(conversationHistory.getContext().length, 0);
});
