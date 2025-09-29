/**
 * Telegram Bot API infrastructure utilities
 */

import type { Context } from "grammy";
import { genCorrelationId, log } from "../utils/logger.ts";

/**
 * Creates authorization middleware for the bot
 * Validates that the user ID is in the list of allowed owners
 */
export function createAuthMiddleware(ownerIds: readonly number[]) {
  return async (ctx: Context, next: () => Promise<void>) => {
    // Generate unique correlation_id for tracking entire update processing session
    (ctx as unknown as { _cid?: string })._cid = genCorrelationId();

    // Log incoming update with message text for debugging
    const messageText = ctx.message?.text;
    log({
      "mod": "tg",
      "event": "update_in",
      "message_text": messageText,
    });

    const uid = ctx.from?.id;
    // Check that user is authorized (ID in owners list)
    if (!uid || !ownerIds.includes(uid)) {
      await ctx.reply("This bot is private. Access denied.");
      log({
        "mod": "tg",
        "event": "unauthorized",
      });
      return;
    }

    await next();
  };
}

/**
 * Creates logging middleware that wraps Context methods to log outgoing messages
 */
export function createLoggingMiddleware() {
  return async (ctx: Context, next: () => Promise<void>) => {
    // Wrap reply method to log outgoing messages
    const originalReply = ctx.reply.bind(ctx);
    ctx.reply = (...args: Parameters<typeof ctx.reply>) => {
      const text = typeof args[0] === "string" ? args[0] : JSON.stringify(args[0]);
      const chatId = ctx.chat?.id;
      if (chatId) {
        log({
          "mod": "tg",
          "event": "reply_out",
          "chat_id": chatId,
          "message_text": text,
        });
      }
      return originalReply(...args);
    };

    // Wrap api.sendMessage method to log outgoing messages
    const originalSendMessage = ctx.api.sendMessage.bind(ctx.api);
    ctx.api.sendMessage = (...args: Parameters<typeof ctx.api.sendMessage>) => {
      const [chatId, text] = args;
      const messageText = typeof text === "string" ? text : JSON.stringify(text);
      log({
        "mod": "tg",
        "event": "message_out",
        "chat_id": chatId,
        "message_text": messageText,
      });
      return originalSendMessage(...args);
    };

    await next();
  };
}
