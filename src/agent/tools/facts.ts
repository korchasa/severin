/**
 * Facts management tools for LLM agent
 * Provides add_fact, delete_fact, update_fact tools for managing persistent facts
 */

import type { FactsStorage } from "../../core/types.ts";
import { log } from "../../utils/logger.ts";
import * as z from "zod";
import { tool } from "ai";

const AddFactParams = z.object({
  content: z.string().min(1, "content is required").max(1000, "content too long"),
});

const DeleteFactParams = z.object({
  id: z.string().min(1, "id is required"),
});

const UpdateFactParams = z.object({
  id: z.string().min(1, "id is required"),
  content: z.string().min(1, "content is required").max(1000, "content too long"),
});

/**
 * Creates add_fact tool for LLM
 */
export function createAddFactTool(factsStorage: FactsStorage) {
  return tool({
    description:
      "Add a new persistent fact to the agent's knowledge base. Facts are stored permanently and included in system prompts.",
    inputSchema: AddFactParams,
    execute: async (input: z.infer<typeof AddFactParams>) => {
      log({
        mod: "llm",
        event: "llm_tool_execution",
        tool: "add_fact",
        content: input.content.slice(0, 100) + (input.content.length > 100 ? "..." : ""),
      });

      const result = await executeAddFact(factsStorage, input);
      return result;
    },
  });
}

/**
 * Creates delete_fact tool for LLM
 */
export function createDeleteFactTool(factsStorage: FactsStorage) {
  return tool({
    description:
      "Delete a fact from the agent's knowledge base by its ID. Use get_all_facts first to find the ID.",
    inputSchema: DeleteFactParams,
    execute: async (input: z.infer<typeof DeleteFactParams>) => {
      log({
        mod: "llm",
        event: "llm_tool_execution",
        tool: "delete_fact",
        id: input.id,
      });

      const result = await executeDeleteFact(factsStorage, input);
      return result;
    },
  });
}

/**
 * Creates update_fact tool for LLM
 */
export function createUpdateFactTool(factsStorage: FactsStorage) {
  return tool({
    description:
      "Update an existing fact in the agent's knowledge base by its ID. Use get_all_facts first to find the ID.",
    inputSchema: UpdateFactParams,
    execute: async (input: z.infer<typeof UpdateFactParams>) => {
      log({
        mod: "llm",
        event: "llm_tool_execution",
        tool: "update_fact",
        id: input.id,
        content: input.content.slice(0, 100) + (input.content.length > 100 ? "..." : ""),
      });

      const result = await executeUpdateFact(factsStorage, input);
      return result;
    },
  });
}

/**
 * Executes add_fact operation - core business logic for adding facts
 * Validates input, calls storage, handles errors with structured logging
 * Returns success/failure response compatible with LLM tool interface
 */
export async function executeAddFact(
  factsStorage: FactsStorage,
  input: z.infer<typeof AddFactParams>,
): Promise<
  { success: boolean; fact?: { id: string; content: string; created: string }; error?: string }
> {
  try {
    // Add fact through storage layer - generates ID and timestamp
    const fact = await factsStorage.add({ content: input.content });
    return {
      success: true,
      fact: {
        id: fact.id,
        content: fact.content,
        created: fact.ts, // Map internal timestamp to user-facing 'created'
      },
    };
  } catch (error) {
    // Log error with truncated content for privacy/security
    log({
      mod: "facts",
      event: "add_error",
      error: (error as Error).message,
      content: input.content.slice(0, 50) + "...",
    });
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Executes delete_fact operation - core business logic for removing facts
 * Attempts deletion and returns result; delete of non-existent fact is considered successful
 * Handles storage errors with structured logging
 */
export async function executeDeleteFact(
  factsStorage: FactsStorage,
  input: z.infer<typeof DeleteFactParams>,
): Promise<{ success: boolean; id: string; error?: string }> {
  try {
    // Delete fact by ID; storage returns true even for non-existent facts
    const deleted = await factsStorage.delete(input.id);
    return {
      success: deleted,
      id: input.id,
    };
  } catch (error) {
    // Log deletion errors with fact ID for debugging
    log({
      mod: "facts",
      event: "delete_error",
      error: (error as Error).message,
      id: input.id,
    });
    return {
      success: false,
      error: (error as Error).message,
      id: input.id,
    };
  }
}

/**
 * Executes update_fact operation - core business logic for modifying facts
 * Updates existing fact content, handles non-existent facts gracefully
 * Returns updated fact or error with structured logging
 */
export async function executeUpdateFact(
  factsStorage: FactsStorage,
  input: z.infer<typeof UpdateFactParams>,
): Promise<
  {
    success: boolean;
    fact?: { id: string; content: string; updated: string };
    error?: string;
    id?: string;
  }
> {
  try {
    // Update fact content; storage returns null if fact doesn't exist
    const fact = await factsStorage.update(input.id, input.content);
    if (!fact) {
      return {
        success: false,
        error: "Fact not found",
        id: input.id,
      };
    }

    return {
      success: true,
      fact: {
        id: fact.id,
        content: fact.content,
        updated: fact.ts, // Map internal timestamp to user-facing 'updated'
      },
    };
  } catch (error) {
    // Log update errors with fact ID for debugging
    log({
      mod: "facts",
      event: "update_error",
      error: (error as Error).message,
      id: input.id,
    });
    return {
      success: false,
      error: (error as Error).message,
      id: input.id,
    };
  }
}
