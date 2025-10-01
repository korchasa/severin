/**
 * Conversation history management with symbol-based limiting on retrieval.
 * Stores SimpleMessage[] internally and converts to ModelMessage[] only in getRecentMessages().
 * Ensures crash-resistance by writing user messages immediately and assistant messages after stream completion.
 */

import {
  type ModelMessage,
  StepResult,
  Tool,
  ToolCallPart,
  ToolResultPart,
  type UIMessage,
} from "ai";
import { SystemInfo } from "../../system-info/system-info.ts";
import { Fact, FactsStorage } from "../facts/types.ts";

// Simple message types compatible with our logic
type SimpleMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ComplexMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | unknown[];
};

/**
 * Internal conversation history wrapper.
 * Stores messages internally as SimpleMessage[] and converts to ModelMessage[] on retrieval.
 * Provides crash-resistance: user messages written immediately, assistant messages after stream completion.
 */
export class ContextBuilder {
  private maxSymbols: number;
  private systemInfo: SystemInfo;
  private factsStorage: FactsStorage;
  private history: SimpleMessage[] = [];
  basePromptTemplate?: string;

  constructor(
    maxSymbols: number,
    systemInfo: SystemInfo,
    factsStorage: FactsStorage,
  ) {
    this.maxSymbols = maxSymbols;
    this.systemInfo = systemInfo;
    this.factsStorage = factsStorage;
  }

  setBasePromptTemplate(basePromptTemplate: string): void {
    this.basePromptTemplate = basePromptTemplate;
  }

  /**
   * Appends a message to conversation history.
   * Accepts UIMessage directly or converts ModelMessage to SimpleMessage.
   * For ModelMessage with complex content (tool calls), serializes to JSON string.
   * User messages are written immediately on request start.
   * Assistant messages are written after stream completion for crash resistance.
   */
  append(msg: UIMessage | ModelMessage): void {
    if (this.isSimpleMessage(msg)) {
      // Convert to SimpleMessage format
      const simpleMessage: SimpleMessage = {
        role: (msg as ComplexMessage).role as "user" | "assistant" | "system",
        content: (msg as ComplexMessage).content as string,
      };
      this.history.push(simpleMessage);
    } else {
      // Convert ModelMessage to SimpleMessage by serializing complex content
      const content = (msg as ComplexMessage).content;
      const simpleMessage: SimpleMessage = {
        role: (msg as ComplexMessage).role as "user" | "assistant" | "system",
        content: typeof content === "string" ? content : JSON.stringify(content),
      };
      this.history.push(simpleMessage);
    }
  }

  appendUserQuery(userQuery: string) {
    this.append({ role: "user", content: userQuery });
  }

  appendAgentStep(
    step: StepResult<
      NoInfer<{
        terminal: Tool;
        add_fact: Tool<
          { content: string },
          { success: true; fact: Fact } | { success: false; error: string }
        >;
        update_fact: Tool<
          { id: string; content: string },
          | { success: true; fact: Fact }
          | { success: false; error: string; id: string }
        >;
        delete_fact: Tool<
          { id: string },
          | { success: true; id: string }
          | { success: false; error: string; id: string }
        >;
      }>
    >,
  ) {
    // Record assistant message with tool calls (if any)
    if (step.toolCalls.length > 0) {
      const toolCallContent: ToolCallPart[] = [];
      for (const tc of step.toolCalls) {
        toolCallContent.push({
          type: "tool-call",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName as unknown as string,
          input: tc.input,
        });
      }
      this.append({
        role: "assistant",
        content: toolCallContent,
      });
    }

    // Record all tool results
    for (const tr of step.toolResults) {
      const toolMsgPart: ToolResultPart = {
        type: "tool-result",
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        output: tr.output,
      };
      this.append({
        role: "tool",
        content: [toolMsgPart],
      });
    }

    // Record assistant message with text response (if any)
    if (step.text) {
      this.append({
        role: "assistant",
        content: [{ type: "text", text: step.text }],
      });
    }
  }

  /**
   * Checks if message is already a SimpleMessage (simple string content).
   */
  private isSimpleMessage(msg: UIMessage | ModelMessage): boolean {
    const content = (msg as ComplexMessage).content;
    const role = (msg as ComplexMessage).role;
    return (
      typeof content === "string" &&
      ["user", "assistant", "system"].includes(role) &&
      !Array.isArray(content)
    );
  }

  async generateBasePrompt(): Promise<string> {
    if (!this.basePromptTemplate) {
      throw new Error("Base prompt template is not set");
    }
    return this.basePromptTemplate
      .replace("{{SERVER_INFO}}", this.systemInfo.toMarkdown())
      .replace("{{FACTS}}", await this.factsStorage.toMarkdown());
  }

  /**
   * Gets recent conversation messages that fit within the specified symbol limit.
   * Converts stored SimpleMessage[] to ModelMessage[] for Vercel AI SDK compatibility.
   * Deserializes complex content that was stored as JSON strings.
   * Returns the most recent messages that can fit within maxSymbols characters.
   * @param maxSymbols Maximum total characters allowed for all messages combined
   */
  getRecentMessages(): ModelMessage[] {
    const result: ModelMessage[] = [];
    let totalSymbols = 0;

    // Start from the most recent messages and work backwards
    for (let i = this.history.length - 1; i >= 0; i--) {
      const simpleMessage = this.history[i];
      let message: ModelMessage;

      // Try to deserialize if content looks like serialized complex content
      if (this.isSerializedComplexContent(simpleMessage.content)) {
        try {
          const parsedContent = JSON.parse(simpleMessage.content);
          message = {
            role: simpleMessage.role,
            content: parsedContent,
          };
        } catch {
          // If parsing fails, treat as regular SimpleMessage
          message = {
            role: simpleMessage.role,
            content: simpleMessage.content,
          };
        }
      } else {
        // Regular SimpleMessage conversion - create ModelMessage
        message = {
          role: simpleMessage.role,
          content: simpleMessage.content,
        };
      }

      const messageLength = this.estimateSymbols(message);

      // Check if adding this message would exceed the limit
      if (totalSymbols + messageLength > this.maxSymbols) {
        // If we already have messages, stop here
        if (result.length > 0) {
          break;
        }
        // If this is the first message and it exceeds limit, skip it and continue
        continue;
      }

      // Add message to the beginning of result to maintain chronological order (oldest first)
      result.unshift(message);
      totalSymbols += messageLength;
    }

    return result;
  }

  /**
   * Checks if content string appears to be serialized complex content (array/object).
   */
  private isSerializedComplexContent(content: string): boolean {
    const trimmed = content.trim();
    return (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    );
  }

  /**
   * Resets conversation history
   */
  reset(): void {
    this.history = [];
  }

  /**
   * Estimate symbol count of a ModelMessage content for budgeting.
   * For string content use its length; for non-string content (tool results) JSON-stringify.
   */
  private estimateSymbols(message: ModelMessage): number {
    const c: unknown = (message as unknown as { content: unknown }).content;
    if (typeof c === "string") return c.length;
    try {
      return JSON.stringify(c ?? "").length;
    } catch {
      return 0;
    }
  }
}
