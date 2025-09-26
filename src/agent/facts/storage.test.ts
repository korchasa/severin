import { assert, assertEquals, assertExists } from "@std/assert";
import { FileFactsStorage } from "./storage.ts";

Deno.test("FileFactsStorage: basic CRUD operations", async () => {
  // Create temporary directory for test
  const tempDir = await Deno.makeTempDir();
  const factsFile = `${tempDir}/facts.jsonl`;

  try {
    const storage = new FileFactsStorage(factsFile);

    // Test add fact
    const fact1 = await storage.add({ content: "Test fact 1" });
    assertExists(fact1.id);
    assertEquals(fact1.content, "Test fact 1");
    assertExists(fact1.ts);

    // Test add another fact
    const fact2 = await storage.add({ content: "Test fact 2" });
    assertExists(fact2.id);
    assertEquals(fact2.content, "Test fact 2");

    // Test getAll
    const allFacts = await storage.getAll();
    assertEquals(allFacts.length, 2);
    assertEquals(allFacts[0].content, "Test fact 1");
    assertEquals(allFacts[1].content, "Test fact 2");

    // Test getById
    const retrievedFact1 = await storage.getById(fact1.id);
    assertExists(retrievedFact1);
    assertEquals(retrievedFact1!.content, "Test fact 1");

    const nonExistentFact = await storage.getById("non-existent-id");
    assertEquals(nonExistentFact, null);

    // Test update
    const updatedFact = await storage.update(fact1.id, "Updated content");
    assertExists(updatedFact);
    assertEquals(updatedFact!.content, "Updated content");

    const allFactsAfterUpdate = await storage.getAll();
    assertEquals(allFactsAfterUpdate.length, 2);
    assertEquals(allFactsAfterUpdate[0].content, "Updated content");
    assertEquals(allFactsAfterUpdate[1].content, "Test fact 2");

    // Test update non-existent fact
    const updateResult = await storage.update("non-existent-id", "New content");
    assertEquals(updateResult, null);

    // Test delete
    const deleteResult = await storage.delete(fact2.id);
    assertEquals(deleteResult, true);

    const allFactsAfterDelete = await storage.getAll();
    assertEquals(allFactsAfterDelete.length, 1);
    assertEquals(allFactsAfterDelete[0].content, "Updated content");

    // Test delete non-existent fact
    const deleteNonExistent = await storage.delete("non-existent-id");
    assertEquals(deleteNonExistent, false);
  } finally {
    // Cleanup
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});

Deno.test("FileFactsStorage: persistence across instances", async () => {
  // Create temporary directory for test
  const tempDir = await Deno.makeTempDir();
  const factsFile = `${tempDir}/facts.jsonl`;

  try {
    // Create first instance and add fact
    const storage1 = new FileFactsStorage(factsFile);
    const fact = await storage1.add({ content: "Persistent fact" });

    // Create second instance and verify fact persists
    const storage2 = new FileFactsStorage(factsFile);
    const allFacts = await storage2.getAll();
    assertEquals(allFacts.length, 1);
    assertEquals(allFacts[0].content, "Persistent fact");
    assertEquals(allFacts[0].id, fact.id);
  } finally {
    // Cleanup
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});

Deno.test("FileFactsStorage: handles non-existent file", async () => {
  // Create temporary directory for test
  const tempDir = await Deno.makeTempDir();
  const factsFile = `${tempDir}/non-existent-facts.jsonl`;

  try {
    const storage = new FileFactsStorage(factsFile);

    // Should work with empty facts initially
    const allFacts = await storage.getAll();
    assertEquals(allFacts.length, 0);

    // Should be able to add facts
    const fact = await storage.add({ content: "First fact" });
    assertExists(fact.id);

    const allFactsAfterAdd = await storage.getAll();
    assertEquals(allFactsAfterAdd.length, 1);
  } finally {
    // Cleanup
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});

Deno.test("FileFactsStorage: toMarkdown formats facts correctly", async () => {
  // Create temporary directory for test
  const tempDir = await Deno.makeTempDir();
  const factsFile = `${tempDir}/facts.jsonl`;

  try {
    const storage = new FileFactsStorage(factsFile);

    // Test empty facts
    const emptyMarkdown = await storage.toMarkdown();
    assertEquals(emptyMarkdown, "No stored facts.");

    // Add some facts
    await storage.add({ content: "Short fact about the system" });
    await storage.add({
      content:
        "This is a much longer fact that contains more detailed information about the server configuration and setup process that might be relevant for future reference and includes additional technical details about networking, security policies, backup procedures, monitoring systems, and various other operational aspects of the server management.",
    });
    await storage.add({ content: "Another brief fact" });

    const markdown = await storage.toMarkdown();

    // Should contain recent facts header with count
    assert(markdown.includes("Recent facts (3/3):"), "Should show recent facts header with count");

    // Should contain fact content
    assert(markdown.includes("Short fact about the system"), "Should include short fact");
    assert(markdown.includes("Another brief fact"), "Should include another fact");

    // Should truncate long facts
    assert(markdown.includes("..."), "Should truncate long content");

    // Should not show "older facts" message when <= 20 facts
    assert(
      !markdown.includes("older facts"),
      "Should not show older facts message for <= 20 facts",
    );
  } finally {
    // Cleanup
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});
