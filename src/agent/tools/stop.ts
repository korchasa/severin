import * as z from "zod";
import { tool } from "ai";

const StopParams = z.object({
  reason: z.string().min(1, "reason is required"),
});

export function stopTool() {
  return tool({
    description: "Stop current execution",
    inputSchema: StopParams,
  });
}
