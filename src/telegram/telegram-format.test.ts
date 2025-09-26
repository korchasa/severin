import { assertEquals } from "@std/assert";
import { escapeMarkdownV2, toCodeBlock } from "./telegram-format.ts";
import { markdownToTelegramMarkdownV2 } from "./telegram-format.ts";

Deno.test("escapeMarkdownV2 - escapes all markdown special characters", () => {
  const input = "_*[]()~`>#+-=|{}.!\\";
  const expected = "\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!\\\\";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - leaves normal text readable", () => {
  const input = "Hello world 123";
  assertEquals(escapeMarkdownV2(input), input);
});

Deno.test("toCodeBlock - wraps into fenced block and strips backticks", () => {
  const input = "some `code` here";
  const out = toCodeBlock(input);
  assertEquals(out, "```\nsome code here\n```");
});

// New converter tests
Deno.test("markdownToTelegramMarkdownV2 - plain text passthrough with escaping", () => {
  const input = "Hello _world_!";
  const out = markdownToTelegramMarkdownV2(input);
  // Should preserve italic formatting for underscores, escape other special chars
  assertEquals(out, "Hello _world_\\!");
});

Deno.test("markdownToTelegramMarkdownV2 - bold and italic", () => {
  const input = "**bold** and *italic*";
  const out = markdownToTelegramMarkdownV2(input);
  // Telegram: bold = *...*, italic = _..._
  assertEquals(out, "*bold* and _italic_");
});

Deno.test("markdownToTelegramMarkdownV2 - inline code", () => {
  const input = "Text with `code` inline";
  const out = markdownToTelegramMarkdownV2(input);
  assertEquals(out, "Text with `code` inline");
});

Deno.test("markdownToTelegramMarkdownV2 - code block fenced", () => {
  const input = "```\nline1\nline2\n```";
  const out = markdownToTelegramMarkdownV2(input);
  assertEquals(out, "```\nline1\nline2\n```");
});

Deno.test("markdownToTelegramMarkdownV2 - link text and url", () => {
  const input = "See [example](https://example.com?q=a_b#c) please";
  const out = markdownToTelegramMarkdownV2(input);
  // In Telegram V2 links keep same syntax; special chars in URL are escaped
  assertEquals(out, "See [example](https://example.com?q=a_b#c) please");
});

Deno.test("markdownToTelegramMarkdownV2 - blockquote", () => {
  const input = "> quoted _text_";
  const out = markdownToTelegramMarkdownV2(input);
  // Blockquote marker is escaped
  assertEquals(out, "\\> quoted _text_");
});

Deno.test("markdownToTelegramMarkdownV2 - headers to bold", () => {
  const input =
    "# Header 1\n## Header 2\n### Header 3\n#### Header 4\n##### Header 5\n###### Header 6";
  const out = markdownToTelegramMarkdownV2(input);
  assertEquals(out, "*Header 1*\n*Header 2*\n*Header 3*\n*Header 4*\n*Header 5*\n*Header 6*");
});

Deno.test("markdownToTelegramMarkdownV2 - headers with mixed content", () => {
  const input = "### Important **bold** header\nSome text\n# Another header";
  const out = markdownToTelegramMarkdownV2(input);
  assertEquals(out, "*Important **bold** header*\nSome text\n*Another header*");
});

Deno.test("markdownToTelegramMarkdownV2 - escapes special characters", () => {
  const input = "Text with . ! > # + - = | { } ~ ( )";
  const out = markdownToTelegramMarkdownV2(input);
  assertEquals(out, "Text with \\. \\! \\> \\# \\+ \\- \\= \\| \\{ \\} \\~ \\( \\)");
});
