/**
 * Facts management tools for LLM agent
 * Provides add_fact, delete_fact, update_fact tools for managing persistent facts
 */

import type { FactsStorage } from "../../core/types.ts";
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
      return await factsStorage.add({ content: input.content });
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
      return await factsStorage.delete(input.id);
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
      return await factsStorage.update(input.id, input.content);
    },
  });
}
