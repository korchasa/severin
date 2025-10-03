/**
 * Types for the Facts system
 */

// Facts types
export interface Fact {
  readonly id: string;
  readonly content: string;
  readonly ts: string;
}

// Facts storage interface
export interface FactsStorage {
  add(content: string): Promise<
    { success: true; fact: Fact } | { success: false; error: string }
  >;
  getAll(): Promise<
    { success: true; facts: readonly Fact[] } | { success: false; error: string }
  >;
  getById(id: string): Promise<
    { success: true; fact: Fact } | { success: false; error: string }
  >;
  update(id: string, content: string): Promise<
    { success: true; fact: Fact } | { success: false; error: string; id: string }
  >;
  delete(id: string): Promise<
    { success: true; id: string } | { success: false; error: string; id: string }
  >;
  toMarkdown(): Promise<string>;
}
