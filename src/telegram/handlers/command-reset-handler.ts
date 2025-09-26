/**
 * History reset command handler
 */

import { z } from "zod";
import type { CommandDef } from "../../core/types.ts";
import type { ConversationHistory } from "../../agent/history/service.ts";
import { logUpdate } from "../../utils/logger.ts";

export function createHistoryResetCommand(
  history: ConversationHistory,
): CommandDef<{ text?: string }> {
  return {
    name: "reset",
    desc: "Clear history messages",
    args: {
      parse: (data: unknown) => ({ text: (data as { text?: string }).text }),
      safeParse: (data: unknown) => ({
        success: true,
        data: { text: (data as { text?: string }).text },
      }),
    } as z.ZodType<{ text?: string }>,
    handler: async (ctx, _args) => {
      history.reset();
      await ctx.reply("Conversation history cleared.");
      logUpdate(ctx, "conversation_reset");
    },
  };
}
