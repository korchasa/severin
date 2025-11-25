import { assertEquals } from "@std/assert";
import { HtmlSplitter } from "./html-splitter.ts";

Deno.test("HtmlSplitter: splits simple text", () => {
  const splitter = new HtmlSplitter(10, "");
  const chunks = splitter.split("123456789012345");
  assertEquals(chunks.length, 2);
  assertEquals(chunks[0], "1234567890");
  assertEquals(chunks[1], "12345");
});

Deno.test("HtmlSplitter: splits with continuation marker", () => {
  const splitter = new HtmlSplitter(15, "...");
  // Chunk 1: "1234567890..." (13 chars) - fits
  // "123456789012..." (15 chars) - fits
  const chunks = splitter.split("123456789012345");
  // 15 - 3 = 12 chars available for text
  // Chunk 1: "123456789012" + "..."
  // Chunk 2: "345"
  assertEquals(chunks[0], "123456789012...");
  assertEquals(chunks[1], "345");
});

Deno.test("HtmlSplitter: splits inside tags", () => {
  const splitter = new HtmlSplitter(20, "...");
  // <b>123456789012345</b>
  // 20 chars max.
  // Open <b>: 3 chars.
  // Close </b>: 4 chars.
  // Marker: 3 chars.
  // Overhead: 4 + 3 = 7 chars.
  // Available for text: 20 - 3 (open) - 7 (overhead) = 10 chars.
  // Chunk 1: <b>1234567890</b>...
  // Chunk 2: <b>12345</b>

  const chunks = splitter.split("<b>123456789012345</b>");
  assertEquals(chunks[0], "<b>1234567890</b>...");
  assertEquals(chunks[1], "<b>12345</b>");
});

Deno.test("HtmlSplitter: handles attributes", () => {
  const splitter = new HtmlSplitter(30, "...");
  // <a href="u">123456789012345</a>
  // <a href="u">: 12 chars
  // </a>: 4 chars
  // ...: 3 chars
  // Overhead: 7 chars
  // Available: 30 - 12 - 7 = 11 chars
  // Chunk 1: <a href="u">12345678901</a>...
  // Chunk 2: <a href="u">2345</a>

  const chunks = splitter.split('<a href="u">123456789012345</a>');
  assertEquals(chunks[0], '<a href="u">12345678901</a>...');
  assertEquals(chunks[1], '<a href="u">2345</a>');
});

Deno.test("HtmlSplitter: handles nested tags", () => {
  const splitter = new HtmlSplitter(30, "...");
  // <b><i>123456789012345</i></b>
  // <b>: 3, <i>: 3. Total open: 6.
  // </i>: 4, </b>: 4. Total close: 8.
  // ...: 3.
  // Overhead: 8 + 3 = 11.
  // Available: 30 - 6 - 11 = 13.
  // Chunk 1: <b><i>1234567890123</i></b>...
  // Chunk 2: <b><i>45</i></b>

  const chunks = splitter.split("<b><i>123456789012345</i></b>");
  assertEquals(chunks[0], "<b><i>1234567890123</i></b>...");
  assertEquals(chunks[1], "<b><i>45</i></b>");
});

Deno.test("HtmlSplitter: handles multiple splits", () => {
  const splitter = new HtmlSplitter(10, ".");
  // 12345678901234567890
  // 10 - 1 = 9 chars
  // Chunk 1: 123456789.
  // Chunk 2: 012345678.
  // Chunk 3: 90

  const chunks = splitter.split("12345678901234567890");
  assertEquals(chunks.length, 3);
  assertEquals(chunks[0], "123456789.");
  assertEquals(chunks[1], "012345678.");
  assertEquals(chunks[2], "90");
});
