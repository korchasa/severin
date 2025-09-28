// deno-lint-ignore-file no-explicit-any
import type { GenerateTextResult } from "ai";

/**
 * Creates a brief dump of the agent's response for analysis and debugging.
 * Includes main request parameters, message chain, termination reasons,
 * tool calls, and the model's final response.
 */
export function shortAgentResponseDump(
  data: GenerateTextResult<any, any>,
): {
  request: {
    model: string;
    temperature: string;
    toolChoice: string;
  };
  finishReason: string;
  messages: {
    role: string;
    content: string;
    type: string;
    name: string;
    arguments: any;
    output: any;
  }[];
  finalResponse: string;
  usage: any;
} {
  return {
    request: {
      model: (data as any)?.response?.body?.model ?? "unknown",
      temperature: (data as any)?.response?.body?.temperature ?? "unknown",
      toolChoice: (data as any)?.response?.body?.tool_choice ?? "unknown",
    },
    finishReason: data?.finishReason ?? "unknown",
    messages: (data as any).request?.body?.input?.map((message: any) => ({
      role: message.role,
      content: (() => {
        if (message?.content?.length > 200) {
          return message?.content?.slice(0, 200) + "...";
        }
        return message?.content;
      })(),
      type: message.type,
      name: message.name,
      arguments: message.arguments,
      output: (() => {
        try {
          return JSON.parse(message.output);
        } catch (_e) {
          return null;
        }
      })(),
    })) ?? [],
    finalResponse: (data as any)?.content[0]?.text ?? "",
    usage: (data as any)?.response?.body?.usage ?? null,
  };
}
