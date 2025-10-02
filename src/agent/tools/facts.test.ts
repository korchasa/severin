/**
 * Tests for facts management tools
 * Tests that tools correctly call Storage methods
 */

import { assertEquals, assertExists } from "@std/assert";
import { createAddFactTool, createDeleteFactTool, createUpdateFactTool } from "./facts.ts";
import type { FactsStorage } from "../facts/types.ts";

// Mock facts storage for testing
class MockFactsStorage {
  addCalledWith: { content: string }[] = [];
  deleteCalledWith: string[] = [];
  updateCalledWith: { id: string; content: string }[] = [];

  async add(factInput: { content: string }): Promise<
    { success: true; fact: { id: string; content: string; ts: string } } | {
      success: false;
      error: string;
    }
  > {
    await Promise.resolve();
    this.addCalledWith.push(factInput);
    return {
      success: true as const,
      fact: {
        id: `fact-${this.addCalledWith.length}`,
        content: factInput.content,
        ts: new Date().toISOString(),
      },
    };
  }

  async delete(id: string): Promise<
    { success: true; id: string } | { success: false; error: string; id: string }
  > {
    await Promise.resolve();
    this.deleteCalledWith.push(id);
    return {
      success: true as const,
      id,
    };
  }

  async update(id: string, content: string): Promise<
    { success: true; fact: { id: string; content: string; ts: string } } | {
      success: false;
      error: string;
      id: string;
    }
  > {
    await Promise.resolve();
    this.updateCalledWith.push({ id, content });
    // Return updated fact for existing IDs, error for non-existent
    if (id === "existing-id") {
      return {
        success: true as const,
        fact: {
          id,
          content,
          ts: new Date().toISOString(),
        },
      };
    }
    return {
      success: false as const,
      error: "Fact not found",
      id,
    };
  }

  // Other methods not used in tests
  async getAll(): Promise<
    { success: true; facts: readonly { id: string; content: string; ts: string }[] } | {
      success: false;
      error: string;
    }
  > {
    await Promise.resolve();
    return { success: true as const, facts: [] };
  }

  async getById(_id: string): Promise<
    { success: true; fact: { id: string; content: string; ts: string } } | {
      success: false;
      error: string;
    }
  > {
    await Promise.resolve();
    return { success: false as const, error: "Not found" };
  }
  async toMarkdown(): Promise<string> {
    await Promise.resolve();
    return "";
  }
}

Deno.test("createAddFactTool: calls storage.add with correct content", async () => {
  const storage = new MockFactsStorage();
  const tool = createAddFactTool(storage);

  const result = await tool.execute!({ content: "Test fact content" }, {
    toolCallId: "test-call",
    messages: [],
  }) as {
    success: boolean;
    fact?: { id: string; content: string; created: string };
    error?: string;
  };

  assertEquals(storage.addCalledWith.length, 1);
  assertEquals(storage.addCalledWith[0].content, "Test fact content");
  assertEquals(result.success, true);
  assertExists(result.fact);
  assertEquals(result.fact.content, "Test fact content");
});

Deno.test("createAddFactTool: handles storage error", async () => {
  const storage = {
    async add() {
      await Promise.resolve();
      return { success: false as const, error: "Storage error" };
    },
  } as unknown as FactsStorage;
  const tool = createAddFactTool(storage);

  const result = await tool.execute!({ content: "Test content" }, {
    toolCallId: "test-call",
    messages: [],
  }) as { success: boolean; error: string };

  assertEquals(result.success, false);
  assertEquals(result.error, "Storage error");
});

Deno.test("createDeleteFactTool: calls storage.delete with correct id", async () => {
  const storage = new MockFactsStorage();
  const tool = createDeleteFactTool(storage);

  const result = await tool.execute!({ id: "test-id" }, {
    toolCallId: "test-call",
    messages: [],
  }) as { success: boolean; id: string };

  assertEquals(storage.deleteCalledWith.length, 1);
  assertEquals(storage.deleteCalledWith[0], "test-id");
  assertEquals(result.success, true);
  assertEquals(result.id, "test-id");
});

Deno.test("createDeleteFactTool: handles storage error", async () => {
  const storage = {
    async delete() {
      await Promise.resolve();
      return { success: false as const, error: "Storage error", id: "test-id" };
    },
  } as unknown as FactsStorage;
  const tool = createDeleteFactTool(storage);

  const result = await tool.execute!({ id: "test-id" }, {
    toolCallId: "test-call",
    messages: [],
  }) as { success: boolean; error: string; id: string };

  assertEquals(result.success, false);
  assertEquals(result.error, "Storage error");
  assertEquals(result.id, "test-id");
});

Deno.test("createUpdateFactTool: calls storage.update with correct id and content", async () => {
  const storage = new MockFactsStorage();
  const tool = createUpdateFactTool(storage);

  const result = await tool.execute!({ id: "existing-id", content: "Updated content" }, {
    toolCallId: "test-call",
    messages: [],
  }) as { success: boolean; fact?: { id: string; content: string; updated: string } };

  assertEquals(storage.updateCalledWith.length, 1);
  assertEquals(storage.updateCalledWith[0].id, "existing-id");
  assertEquals(storage.updateCalledWith[0].content, "Updated content");
  assertEquals(result.success, true);
  assertExists(result.fact);
  assertEquals(result.fact.content, "Updated content");
});

Deno.test("createUpdateFactTool: handles non-existent fact", async () => {
  const storage = new MockFactsStorage();
  const tool = createUpdateFactTool(storage);

  const result = await tool.execute!({ id: "non-existent-id", content: "New content" }, {
    toolCallId: "test-call",
    messages: [],
  }) as { success: boolean; error: string; id: string };

  assertEquals(storage.updateCalledWith.length, 1);
  assertEquals(storage.updateCalledWith[0].id, "non-existent-id");
  assertEquals(storage.updateCalledWith[0].content, "New content");
  assertEquals(result.success, false);
  assertEquals(result.error, "Fact not found");
  assertEquals(result.id, "non-existent-id");
});

Deno.test("createUpdateFactTool: handles storage error", async () => {
  const storage = {
    async update() {
      await Promise.resolve();
      return { success: false as const, error: "Storage error", id: "test-id" };
    },
  } as unknown as FactsStorage;
  const tool = createUpdateFactTool(storage);

  const result = await tool.execute!({ id: "test-id", content: "New content" }, {
    toolCallId: "test-call",
    messages: [],
  }) as { success: boolean; error: string; id: string };

  assertEquals(result.success, false);
  assertEquals(result.error, "Storage error");
  assertEquals(result.id, "test-id");
});
