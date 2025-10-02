/**
 * History reset command handler
 */

import { z } from "zod";
import type { CommandDef } from "../types.ts";
import type { ContextBuilder } from "../../agent/context/builder.ts";
import { log } from "../../utils/logger.ts";

export function createHistoryResetCommand(
  history: ContextBuilder,
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
      log({
        "mod": "tg",
        "event": "conversation_reset",
      });
    },
  };
}
