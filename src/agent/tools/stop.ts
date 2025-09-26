import * as z from "zod";
import { log } from "../../utils/logger.ts";
import { tool } from "ai";

const StopParams = z.object({
  reason: z.string().min(1, "reason is required"),
});

export function stopTool() {
  return tool({
    description: "Stop current execution",
    inputSchema: StopParams,
    execute: (_input: z.infer<typeof StopParams>) => {
      log({
        mod: "llm",
        event: "llm_tool_execution",
        tool: "stop",
      });
    },
  });
}
