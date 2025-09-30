import z from "zod";
import { TerminalRequest, TerminalResponse } from "../../core/types.ts";
import { AddFactParams, DeleteFactParams, UpdateFactParams } from "./facts.ts";

export type ToolName = "terminal" | "add_fact" | "update_fact" | "delete_fact";
export type ToolInput =
  | TerminalRequest
  | z.infer<typeof AddFactParams>
  | z.infer<typeof UpdateFactParams>
  | z.infer<typeof DeleteFactParams>;
export type ToolOutput = TerminalResponse | unknown;

export { createAddFactTool, createDeleteFactTool, createUpdateFactTool } from "./facts.ts";
export { createTerminalTool } from "./terminal.ts";
