import { Tool, ToolCallOptions, ToolSet, TypedToolCall, TypedToolResult } from "ai";
import { TerminalRequest } from "../core/types.ts";
import {
  AddFactParams,
  createAddFactTool,
  createDeleteFactTool,
  createUpdateFactTool,
  DeleteFactParams,
  UpdateFactParams,
} from "./tools/facts.ts";
import { FactsStorage, TerminalResponse } from "../core/types.ts";
import z from "zod";

export interface MainAgentExecutor {
  getTools(): ToolSet;
}
export type ToolName = "terminal" | "add_fact" | "update_fact" | "delete_fact";
export type ToolInput =
  | TerminalRequest
  | z.infer<typeof AddFactParams>
  | z.infer<typeof UpdateFactParams>
  | z.infer<typeof DeleteFactParams>;
export type ToolOutput = TerminalResponse | unknown;
export type beforeToolCallsThoughts = (thoughts: string) => void;
export type beforeToolCallHandler = (call: TypedToolCall<ToolSet>) => void;
export type afterToolCallHandler = (result: TypedToolResult<ToolSet>) => void;

export class MainAgentExecutor implements MainAgentExecutor {
  terminalTool: Tool;
  factsStorage: FactsStorage;
  tools: Record<ToolName, Tool>;

  constructor(terminalTool: Tool, factsStorage: FactsStorage) {
    this.terminalTool = terminalTool;
    this.factsStorage = factsStorage;
    this.tools = {
      terminal: this.terminalTool,
      add_fact: createAddFactTool(this.factsStorage),
      update_fact: createUpdateFactTool(this.factsStorage),
      delete_fact: createDeleteFactTool(this.factsStorage),
    };
  }

  public getTools(): ToolSet {
    return Object.fromEntries(
      Object.entries(this.tools).map(([key, value]) => [
        key,
        {
          description: value.description,
          inputSchema: value.inputSchema,
        },
      ]),
    );
  }

  public executeTool(toolName: ToolName, input: ToolInput, thoughts: string) {
    const tool = this.tools[toolName];
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    if (!tool.execute) {
      throw new Error(`Tool ${toolName} does not have an execute method`);
    }
    const options: ToolCallOptions = {
      toolCallId: crypto.randomUUID(),
      messages: [
        {
          role: "user",
          content: thoughts,
        },
      ],
    };
    return tool.execute(input, options);
  }
}
