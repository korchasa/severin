import { assert, assertEquals, assertExists } from "@std/assert";
import { FileFactsStorage } from "./storage.ts";

Deno.test("FileFactsStorage: basic CRUD operations", async () => {
  // Create temporary directory for test
  const tempDir = await Deno.makeTempDir();
  const factsFile = `${tempDir}/facts.jsonl`;

  try {
    const storage = new FileFactsStorage(factsFile);

    // Test add fact
    const addResult1 = await storage.add({ content: "Test fact 1" });
    assertEquals(addResult1.success, true);
    if (addResult1.success) {
      assertExists(addResult1.fact.id);
      assertEquals(addResult1.fact.content, "Test fact 1");
      assertExists(addResult1.fact.ts);
    }
    const fact1 = addResult1.success ? addResult1.fact : { id: "", content: "", ts: "" };

    // Test add another fact
    const addResult2 = await storage.add({ content: "Test fact 2" });
    assertEquals(addResult2.success, true);
    if (addResult2.success) {
      assertExists(addResult2.fact.id);
      assertEquals(addResult2.fact.content, "Test fact 2");
    }
    const fact2 = addResult2.success ? addResult2.fact : { id: "", content: "", ts: "" };

    // Test getAll
    const getAllResult = await storage.getAll();
    assertEquals(getAllResult.success, true);
    if (getAllResult.success) {
      assertEquals(getAllResult.facts.length, 2);
      assertEquals(getAllResult.facts[0].content, "Test fact 1");
      assertEquals(getAllResult.facts[1].content, "Test fact 2");
    }

    // Test getById
    const getByIdResult1 = await storage.getById(fact1.id);
    assertEquals(getByIdResult1.success, true);
    if (getByIdResult1.success) {
      assertEquals(getByIdResult1.fact.content, "Test fact 1");
    }

    const getByIdResultNonExistent = await storage.getById("non-existent-id");
    assertEquals(getByIdResultNonExistent.success, false);
    if (!getByIdResultNonExistent.success) {
      assertEquals(getByIdResultNonExistent.error, "Fact not found");
    }

    // Test update
    const updateResult = await storage.update(fact1.id, "Updated content");
    assertEquals(updateResult.success, true);
    if (updateResult.success) {
      assertEquals(updateResult.fact.content, "Updated content");
    }

    const getAllAfterUpdate = await storage.getAll();
    assertEquals(getAllAfterUpdate.success, true);
    if (getAllAfterUpdate.success) {
      assertEquals(getAllAfterUpdate.facts.length, 2);
      assertEquals(getAllAfterUpdate.facts[0].content, "Updated content");
      assertEquals(getAllAfterUpdate.facts[1].content, "Test fact 2");
    }

    // Test update non-existent fact
    const updateNonExistentResult = await storage.update("non-existent-id", "New content");
    assertEquals(updateNonExistentResult.success, false);
    if (!updateNonExistentResult.success) {
      assertEquals(updateNonExistentResult.error, "Fact not found");
    }

    // Test delete
    const deleteResult = await storage.delete(fact2.id);
    assertEquals(deleteResult.success, true);
    if (deleteResult.success) {
      assertEquals(deleteResult.id, fact2.id);
    }

    const getAllAfterDelete = await storage.getAll();
    assertEquals(getAllAfterDelete.success, true);
    if (getAllAfterDelete.success) {
      assertEquals(getAllAfterDelete.facts.length, 1);
      assertEquals(getAllAfterDelete.facts[0].content, "Updated content");
    }

    // Test delete non-existent fact
    const deleteNonExistentResult = await storage.delete("non-existent-id");
    assertEquals(deleteNonExistentResult.success, false);
    if (!deleteNonExistentResult.success) {
      assertEquals(deleteNonExistentResult.error, "Fact not found");
      assertEquals(deleteNonExistentResult.id, "non-existent-id");
    }
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
    const addResult = await storage1.add({ content: "Persistent fact" });
    assertEquals(addResult.success, true);
    const fact = addResult.success ? addResult.fact : { id: "", content: "", ts: "" };

    // Create second instance and verify fact persists
    const storage2 = new FileFactsStorage(factsFile);
    const getAllResult = await storage2.getAll();
    assertEquals(getAllResult.success, true);
    if (getAllResult.success) {
      assertEquals(getAllResult.facts.length, 1);
      assertEquals(getAllResult.facts[0].content, "Persistent fact");
      assertEquals(getAllResult.facts[0].id, fact.id);
    }
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
    const getAllResult = await storage.getAll();
    assertEquals(getAllResult.success, true);
    if (getAllResult.success) {
      assertEquals(getAllResult.facts.length, 0);
    }

    // Should be able to add facts
    const addResult = await storage.add({ content: "First fact" });
    assertEquals(addResult.success, true);
    if (addResult.success) {
      assertExists(addResult.fact.id);
    }

    const getAllAfterAdd = await storage.getAll();
    assertEquals(getAllAfterAdd.success, true);
    if (getAllAfterAdd.success) {
      assertEquals(getAllAfterAdd.facts.length, 1);
    }
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
    const addResult1 = await storage.add({ content: "Short fact about the system" });
    assertEquals(addResult1.success, true);
    const addResult2 = await storage.add({
      content:
        "This is a much longer fact that contains more detailed information about the server configuration and setup process that might be relevant for future reference and includes additional technical details about networking, security policies, backup procedures, monitoring systems, and various other operational aspects of the server management.",
    });
    assertEquals(addResult2.success, true);
    const addResult3 = await storage.add({ content: "Another brief fact" });
    assertEquals(addResult3.success, true);

    const markdown = await storage.toMarkdown();

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

Deno.test("FileFactsStorage: handles read errors gracefully", async () => {
  const tempDir = await Deno.makeTempDir();
  const factsFile = `${tempDir}/test-facts.jsonl`;

  // Create a file with invalid JSON
  await Deno.writeTextFile(factsFile, '{"invalid": json}\n');

  const storage = new FileFactsStorage(factsFile);

  // Should load successfully but skip invalid lines
  const getAllResult = await storage.getAll();
  assertEquals(getAllResult.success, true);
  if (getAllResult.success) {
    assertEquals(getAllResult.facts.length, 0, "Should skip invalid JSON lines");
  }

  // Should be able to add facts despite previous parse errors
  const addResult = await storage.add({ content: "New fact after error" });
  assertEquals(addResult.success, true);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("FileFactsStorage: handles write errors", async () => {
  const tempDir = await Deno.makeTempDir();
  const readonlyDir = `${tempDir}/readonly`;
  await Deno.mkdir(readonlyDir);
  await Deno.chmod(readonlyDir, 0o444); // readonly directory

  const factsFile = `${readonlyDir}/facts.jsonl`;

  const storage = new FileFactsStorage(factsFile);

  // Add should fail due to write permission
  const addResult = await storage.add({ content: "This should fail" });
  assertEquals(addResult.success, false);
  if (!addResult.success) {
    assert(
      addResult.error.includes("denied") || addResult.error.includes("permission") ||
        addResult.error.includes("readonly"),
    );
  }

  // Update should also fail
  const updateResult = await storage.update("nonexistent", "content");
  assertEquals(updateResult.success, false);
  if (!updateResult.success) {
    assert(
      updateResult.error.includes("denied") || updateResult.error.includes("permission") ||
        updateResult.error.includes("readonly"),
    );
  }

  // Delete should also fail
  const deleteResult = await storage.delete("nonexistent");
  assertEquals(deleteResult.success, false);
  if (!deleteResult.success) {
    assert(
      deleteResult.error.includes("denied") || deleteResult.error.includes("permission") ||
        deleteResult.error.includes("readonly"),
    );
  }

  // Cleanup (need to restore write permissions first)
  await Deno.chmod(readonlyDir, 0o755);
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("FileFactsStorage: toMarkdown throws on read errors", async () => {
  const tempDir = await Deno.makeTempDir();
  const factsFile = `${tempDir}/error-facts.jsonl`;

  // Create a file with invalid JSON
  await Deno.writeTextFile(factsFile, '{"invalid": json}\n');

  const storage = new FileFactsStorage(factsFile);

  try {
    await storage.toMarkdown();
    assert(false, "Should have thrown an exception");
  } catch (error) {
    assert(error instanceof Error, "Should throw Error");
    assert((error as Error).message.includes("parse errors"));
  }

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});
