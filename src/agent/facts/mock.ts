/**
 * Mock implementations for Facts system testing
 */

import type { Fact, FactsStorage } from "./types.ts";

// Mock classes for testing
export class MockFactsStorage implements FactsStorage {
  add(_fact: Omit<Fact, "id" | "ts">): Promise<
    { success: true; fact: Fact } | { success: false; error: string }
  > {
    return Promise.resolve({
      success: false,
      error: "Not implemented in mock",
    });
  }

  getAll(): Promise<
    { success: true; facts: readonly Fact[] } | { success: false; error: string }
  > {
    return Promise.resolve({
      success: false,
      error: "Not implemented in mock",
    });
  }

  getById(_id: string): Promise<
    { success: true; fact: Fact } | { success: false; error: string }
  > {
    return Promise.resolve({
      success: false,
      error: "Not implemented in mock",
    });
  }

  update(_id: string, _content: string): Promise<
    { success: true; fact: Fact } | { success: false; error: string; id: string }
  > {
    return Promise.resolve({
      success: false,
      error: "Not implemented in mock",
      id: _id,
    });
  }

  delete(_id: string): Promise<
    { success: true; id: string } | { success: false; error: string; id: string }
  > {
    return Promise.resolve({
      success: false,
      error: "Not implemented in mock",
      id: _id,
    });
  }

  toMarkdown(): Promise<string> {
    return Promise.resolve("# Facts\n\nNo facts available in mock.");
  }
}
