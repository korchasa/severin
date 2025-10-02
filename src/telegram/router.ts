/**
 * Command router with declarative command registry and validation
 */

import type { Bot, Context } from "grammy";
import { z } from "zod";
import type { CommandDef } from "./types.ts";
import { log } from "../utils/logger.ts";

/**
 * Command registry for managing bot commands
 */
export class CommandRouter {
  private commands: CommandDef<unknown>[] = [];

  /**
   * Registers a command with validation and error handling
   */
  registerCommand<A>(def: CommandDef<A>): void {
    this.commands.push(def as CommandDef<unknown>);
  }

  /**
   * Gets all registered commands
   */
  getCommands(): CommandDef<unknown>[] {
    return this.commands;
  }

  /**
   * Sets up command handlers on the bot
   */
  setupHandlers(bot: Bot<Context>): void {
    for (const def of this.commands) {
      bot.command(def.name, async (ctx) => {
        const text = ctx.message?.text ?? "";
        // Remove command prefix from text to get arguments
        const raw = text.replace(new RegExp(`^/${def.name}\\s*`), "");
        // Convention: single text argument maps to { text?: string }
        const candidate = { text: raw.trim() || undefined } as unknown;
        const parsed = (def.args as z.ZodType<unknown>).safeParse(candidate);
        if (!parsed.success) {
          log({
            "mod": "tg",
            "event": "command_validation_error",
            "command": def.name,
          });
          await ctx.reply("Input data appears incorrect. Try /help.");
          return;
        }
        log({
          "mod": "tg",
          "event": "command_executed",
          "command": def.name,
        });
        await def.handler(ctx, parsed.data);
      });
    }
  }

  /**
   * Sets up a text message handler that processes any text message as an LLM query
   */
  setupTextHandler(bot: Bot<Context>, handler: (ctx: Context) => Promise<void>): void {
    bot.on("message:text", handler);
  }
}
