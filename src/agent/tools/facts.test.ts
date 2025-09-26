/**
 * Tests for facts management tools and functions
 * Tests the execute* functions that implement fact CRUD operations
 * and validate the LLM tool integration
 */

import { assertEquals, assertExists } from "@std/assert";
import { executeAddFact, executeDeleteFact, executeUpdateFact } from "./facts.ts";
import type { FactsStorage } from "../../core/types.ts";

// Mock facts storage for testing
class MockFactsStorage {
  facts: Array<{ id: string; content: string; ts: string }> = [];

  async add(factInput: { content: string }) {
    // Mock async operation
    await Promise.resolve();
    const fact = {
      id: `fact-${this.facts.length + 1}`,
      content: factInput.content,
      ts: new Date().toISOString(),
    };
    this.facts.push(fact);
    return fact;
  }

  async getAll() {
    // Mock async operation
    await Promise.resolve();
    return [...this.facts];
  }

  async getById(id: string) {
    // Mock async operation
    await Promise.resolve();
    return this.facts.find((f) => f.id === id) || null;
  }

  async update(id: string, content: string) {
    // Mock async operation
    await Promise.resolve();
    const index = this.facts.findIndex((f) => f.id === id);
    if (index === -1) return null;

    this.facts[index].content = content;
    this.facts[index].ts = new Date().toISOString();
    return this.facts[index];
  }

  async delete(id: string) {
    // Mock async operation
    await Promise.resolve();
    this.facts = this.facts.filter((f) => f.id !== id);
    return true; // Always return true - deleting non-existent fact is not an error
  }

  async toMarkdown() {
    // Mock async operation
    await Promise.resolve();
    if (this.facts.length === 0) {
      return "No stored facts.";
    }

    // Sort facts by timestamp (newest first) and take first 20
    const recentFacts = [...this.facts]
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 20);

    const sections: string[] = [];

    recentFacts.forEach((fact, index) => {
      const date = new Date(fact.ts).toLocaleDateString();
      const truncatedContent = fact.content.length > 200
        ? fact.content.slice(0, 200) + "..."
        : fact.content;
      sections.push(`${index + 1}. ${truncatedContent} (${date})`);
    });

    if (this.facts.length > 20) {
      sections.push(`... and ${this.facts.length - 20} older facts`);
    }

    return sections.join("\n");
  }
}

Deno.test("executeAddFact: adds fact successfully", async () => {
  const storage = new MockFactsStorage();

  const result = await executeAddFact(storage, { content: "Test fact content" });

  assertEquals(result.success, true);
  assertExists(result.fact);
  assertEquals(result.fact.content, "Test fact content");
  assertExists(result.fact.id);
  assertExists(result.fact.created);

  // Verify fact was added to storage
  const allFacts = await storage.getAll();
  assertEquals(allFacts.length, 1);
  assertEquals(allFacts[0].content, "Test fact content");
});

Deno.test("executeAddFact: handles storage error", async () => {
  const storage = {
    async add() {
      await Promise.resolve();
      throw new Error("Storage error");
    },
  } as unknown as FactsStorage;

  const result = await executeAddFact(storage, { content: "Test content" });

  assertEquals(result.success, false);
  assertEquals(result.error, "Storage error");
});

Deno.test("executeDeleteFact: deletes fact successfully", async () => {
  const storage = new MockFactsStorage();
  const fact = await storage.add({ content: "Test fact" });

  const result = await executeDeleteFact(storage, { id: fact.id });

  assertEquals(result.success, true);
  assertEquals(result.id, fact.id);

  // Verify fact was deleted
  const allFacts = await storage.getAll();
  assertEquals(allFacts.length, 0);
});

Deno.test("executeDeleteFact: handles non-existent fact", async () => {
  const storage = new MockFactsStorage();

  const result = await executeDeleteFact(storage, { id: "non-existent-id" });

  assertEquals(result.success, true); // Delete of non-existent is considered successful
  assertEquals(result.id, "non-existent-id");
});

Deno.test("executeUpdateFact: updates fact successfully", async () => {
  const storage = new MockFactsStorage();
  const fact = await storage.add({ content: "Original content" });

  const result = await executeUpdateFact(storage, { id: fact.id, content: "Updated content" });

  assertEquals(result.success, true);
  assertExists(result.fact);
  assertEquals(result.fact.content, "Updated content");
  assertEquals(result.fact.id, fact.id);
  assertExists(result.fact.updated);

  // Verify fact was updated in storage
  const allFacts = await storage.getAll();
  assertEquals(allFacts.length, 1);
  assertEquals(allFacts[0].content, "Updated content");
});

Deno.test("executeUpdateFact: handles non-existent fact", async () => {
  const storage = new MockFactsStorage();

  const result = await executeUpdateFact(storage, {
    id: "non-existent-id",
    content: "New content",
  });

  assertEquals(result.success, false);
  assertEquals(result.error, "Fact not found");
  assertEquals(result.id, "non-existent-id");
});
