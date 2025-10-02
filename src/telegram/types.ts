/**
 * Types for Telegram integration
 */

import type { Context } from "grammy";
import { z } from "zod";

export interface CommandDef<A> {
  readonly name: string;
  readonly desc: string;
  readonly args: z.ZodType<A>;
  readonly handler: (ctx: Context, args: A) => Promise<void>;
}
