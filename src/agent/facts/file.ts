/**
 * Facts service with file-based persistence
 * Manages persistent facts that can be stored, retrieved, and modified by the agent
 * Uses custom timestamp-based ID generation instead of external dependencies
 */

import type { Fact, FactsStorage } from "./types.ts";
import { log } from "../../utils/logger.ts";

/**
 * Generates a short character ID based on timestamp
 * Uses base64 representation of current time in milliseconds
 * Similar to Twitter identifiers (snowflake IDs)
 */
export function generateId(timestamp?: number): string {
  const ts = timestamp ?? Date.now();
  return btoa(ts.toString()).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * File-based facts storage implementation
 */
export class FileFactsStorage implements FactsStorage {
  private readonly filePath: string;
  private facts: Fact[] = [];
  private loaded = false;
  private parseErrors = 0;

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

      const parsedFacts: Fact[] = [];
      this.parseErrors = 0;
      for (const line of lines) {
        try {
          const fact = JSON.parse(line) as Fact;
          parsedFacts.push(fact);
        } catch (e) {
          log({
            mod: "facts",
            event: "parse_error",
            error: (e as Error).message,
            line: line.slice(0, 100) + "...",
          });
          this.parseErrors++;
        }
      }
      this.facts = parsedFacts;

      log({
        mod: "facts",
        event: "loaded",
        count: this.facts.length,
        filePath: this.filePath,
      });

      this.loaded = true;
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        // File doesn't exist yet, start with empty facts
        this.facts = [];
        log({
          mod: "facts",
          event: "file_not_found",
          filePath: this.filePath,
        });
        this.loaded = true;
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
  }

  /**
   * Saves facts to file
   */
  private async save(): Promise<void> {
    const lines = this.facts.length > 0
      ? this.facts.map((fact) => JSON.stringify(fact)).join("\n") + "\n"
      : "";

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
  async add(factInput: Omit<Fact, "id" | "ts">): Promise<
    { success: true; fact: Fact } | { success: false; error: string }
  > {
    try {
      await this.ensureLoaded();

      const timestamp = Date.now();

      const fact: Fact = {
        id: generateId(timestamp),
        content: factInput.content,
        ts: new Date(timestamp).toISOString(),
      };

      this.facts.push(fact);
      await this.save();

      log({
        mod: "facts",
        event: "added",
        id: fact.id,
        content: fact.content.slice(0, 100) + (fact.content.length > 100 ? "..." : ""),
      });

      return { success: true, fact };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Gets all facts
   */
  async getAll(): Promise<
    { success: true; facts: readonly Fact[] } | { success: false; error: string }
  > {
    try {
      await this.ensureLoaded();
      return { success: true, facts: [...this.facts] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Gets a fact by ID
   */
  async getById(id: string): Promise<
    { success: true; fact: Fact } | { success: false; error: string }
  > {
    try {
      await this.ensureLoaded();
      const fact = this.facts.find((fact) => fact.id === id);
      if (!fact) {
        return { success: false, error: "Fact not found" };
      }
      return { success: true, fact };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Updates a fact by ID
   */
  async update(id: string, content: string): Promise<
    { success: true; fact: Fact } | { success: false; error: string; id: string }
  > {
    try {
      await this.ensureLoaded();

      const index = this.facts.findIndex((fact) => fact.id === id);
      if (index === -1) {
        return { success: false, error: "Fact not found", id };
      }

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

      return { success: true, fact: updatedFact };
    } catch (error) {
      return { success: false, error: (error as Error).message, id };
    }
  }

  /**
   * Deletes a fact by ID
   */
  async delete(id: string): Promise<
    { success: true; id: string } | { success: false; error: string; id: string }
  > {
    try {
      await this.ensureLoaded();

      const index = this.facts.findIndex((fact) => fact.id === id);
      if (index === -1) {
        return { success: false, error: "Fact not found", id };
      }
      this.facts.splice(index, 1);
      await this.save();

      log({
        mod: "facts",
        event: "deleted",
        id,
      });

      return { success: true, id };
    } catch (error) {
      return { success: false, error: (error as Error).message, id };
    }
  }

  /**
   * Formats facts as structured markdown for system prompts
   * Throws exception if reading/saving fails or if there were parse errors
   */
  async toMarkdown(): Promise<string> {
    // Load facts, throwing on error
    try {
      await this.ensureLoaded();
    } catch (error) {
      throw new Error(`Failed to load facts: ${(error as Error).message}`);
    }

    // Throw if there were parse errors during loading
    if (this.parseErrors > 0) {
      throw new Error(
        `Facts file contains ${this.parseErrors} parse errors. File may be corrupted.`,
      );
    }

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

/**
 * Creates a file-based facts storage
 */
export function createFactsStorage(dataDir: string): FactsStorage {
  const factsFilePath = `${dataDir}/facts.jsonl`;
  return new FileFactsStorage(factsFilePath);
}
