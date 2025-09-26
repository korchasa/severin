/**
 * Facts service with file-based persistence
 * Manages persistent facts that can be stored, retrieved, and modified by the agent
 */

import type { Fact, FactsStorage } from "../../core/types.ts";
import { log } from "../../utils/logger.ts";
import { nanoid } from "nanoid";

/**
 * File-based facts storage implementation
 */
export class FileFactsStorage implements FactsStorage {
  private readonly filePath: string;
  private facts: Fact[] = [];
  private loaded = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Ensures facts are loaded from file
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    try {
      const content = await Deno.readTextFile(this.filePath);
      const lines = content.trim().split("\n").filter((line) => line.trim());

      this.facts = lines.map((line) => {
        try {
          return JSON.parse(line) as Fact;
        } catch (e) {
          log({
            mod: "facts",
            event: "parse_error",
            error: (e as Error).message,
            line: line.slice(0, 100) + "...",
          });
          return null;
        }
      }).filter((fact): fact is Fact => fact !== null);

      log({
        mod: "facts",
        event: "loaded",
        count: this.facts.length,
        filePath: this.filePath,
      });
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        // File doesn't exist yet, start with empty facts
        this.facts = [];
        log({
          mod: "facts",
          event: "file_not_found",
          filePath: this.filePath,
        });
      } else {
        log({
          mod: "facts",
          event: "load_error",
          error: (e as Error).message,
          filePath: this.filePath,
        });
        throw e;
      }
    }

    this.loaded = true;
  }

  /**
   * Saves facts to file
   */
  private async save(): Promise<void> {
    const lines = this.facts.map((fact) => JSON.stringify(fact)).join("\n") + "\n";

    await Deno.writeTextFile(this.filePath, lines);

    log({
      mod: "facts",
      event: "saved",
      count: this.facts.length,
      filePath: this.filePath,
    });
  }

  /**
   * Adds a new fact
   */
  async add(factInput: Omit<Fact, "id" | "ts">): Promise<Fact> {
    await this.ensureLoaded();

    const fact: Fact = {
      id: nanoid(),
      content: factInput.content,
      ts: new Date().toISOString(),
    };

    this.facts.push(fact);
    await this.save();

    log({
      mod: "facts",
      event: "added",
      id: fact.id,
      content: fact.content.slice(0, 100) + (fact.content.length > 100 ? "..." : ""),
    });

    return fact;
  }

  /**
   * Gets all facts
   */
  async getAll(): Promise<readonly Fact[]> {
    await this.ensureLoaded();
    return [...this.facts];
  }

  /**
   * Gets a fact by ID
   */
  async getById(id: string): Promise<Fact | null> {
    await this.ensureLoaded();
    return this.facts.find((fact) => fact.id === id) || null;
  }

  /**
   * Updates a fact by ID
   */
  async update(id: string, content: string): Promise<Fact | null> {
    await this.ensureLoaded();

    const index = this.facts.findIndex((fact) => fact.id === id);
    if (index === -1) return null;

    const updatedFact: Fact = {
      ...this.facts[index],
      content,
      ts: new Date().toISOString(),
    };

    this.facts[index] = updatedFact;
    await this.save();

    log({
      mod: "facts",
      event: "updated",
      id,
      content: content.slice(0, 100) + (content.length > 100 ? "..." : ""),
    });

    return updatedFact;
  }

  /**
   * Deletes a fact by ID
   */
  async delete(id: string): Promise<boolean> {
    await this.ensureLoaded();

    const initialLength = this.facts.length;
    this.facts = this.facts.filter((fact) => fact.id !== id);

    if (this.facts.length < initialLength) {
      await this.save();

      log({
        mod: "facts",
        event: "deleted",
        id,
      });

      return true;
    }

    return false;
  }

  /**
   * Formats facts as structured markdown for system prompts
   */
  async toMarkdown(): Promise<string> {
    await this.ensureLoaded();

    if (this.facts.length === 0) {
      return "No stored facts.";
    }

    // Sort facts by timestamp (newest first) and take first 20
    const recentFacts = [...this.facts]
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 20);

    const sections: string[] = [];
    sections.push(`Recent facts (${recentFacts.length}/${this.facts.length}):`);

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

/**
 * Creates a file-based facts storage
 */
export function createFactsStorage(dataDir: string): FactsStorage {
  const factsFilePath = `${dataDir}/facts.jsonl`;
  return new FileFactsStorage(factsFilePath);
}
