import { assertEquals } from "@std/assert";
import { escapeHtml, markdownToTelegramHTML, toPre, toPreCode } from "./telegram-format.ts";

Deno.test("escapeHtml - escapes HTML special chars", () => {
  const input = "<b>&\"'</b>";
  const expected = "&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;";
  assertEquals(escapeHtml(input), expected);
});

Deno.test("toPre - wraps text into <pre> with escaping", () => {
  const input = "<tag> & text";
  const out = toPre(input);
  assertEquals(out, "<pre>&lt;tag&gt; &amp; text</pre>");
});

Deno.test("toPreCode - wraps code with optional language", () => {
  const out1 = toPreCode({ code: "a < b" });
  assertEquals(out1, "<pre><code>a &lt; b</code></pre>");
  const out2 = toPreCode({ code: "print(1)", language: "python" });
  assertEquals(out2, '<pre><code class="language-python">print(1)</code></pre>');
});

Deno.test("markdownToTelegramHTML - plain text", () => {
  const input = "Hello world!";
  const out = markdownToTelegramHTML(input);
  assertEquals(out, "Hello world!");
});

Deno.test("markdownToTelegramHTML - bold and italic", () => {
  const input = "**bold** and *italic* _more_";
  const out = markdownToTelegramHTML(input);
  assertEquals(out, "<b>bold</b> and <i>italic</i> <i>more</i>");
});

Deno.test("markdownToTelegramHTML - inline code", () => {
  const input = "Text with `code` inline";
  const out = markdownToTelegramHTML(input);
  assertEquals(out, "Text with <code>code</code> inline");
});

Deno.test("markdownToTelegramHTML - code block fenced", () => {
  const input = "```\nline1\nline2\n```";
  const out = markdownToTelegramHTML(input);
  assertEquals(out, "<pre><code>line1\nline2</code></pre>");
});

Deno.test("markdownToTelegramHTML - link", () => {
  const input = "See [example](https://example.com?q=a_b#c) please";
  const out = markdownToTelegramHTML(input);
  assertEquals(out, 'See <a href="https://example.com?q=a_b#c">example</a> please');
});

Deno.test("markdownToTelegramHTML - blockquote", () => {
  const input = "> quoted _text_\n> second";
  const out = markdownToTelegramHTML(input);
  assertEquals(out, "<blockquote>quoted _text_\nsecond</blockquote>");
});

Deno.test("markdownToTelegramHTML - headers to bold", () => {
  const input =
    "# Header 1\n## Header 2\n### Header 3\n#### Header 4\n##### Header 5\n###### Header 6";
  const out = markdownToTelegramHTML(input);
  assertEquals(
    out,
    "<b>Header 1</b>\n<b>Header 2</b>\n<b>Header 3</b>\n<b>Header 4</b>\n<b>Header 5</b>\n<b>Header 6</b>",
  );
});

Deno.test("markdownToTelegramHTML - unclosed italic is converted", () => {
  const input = "Text with _unclosed italic";
  const out = markdownToTelegramHTML(input);
  assertEquals(out, "Text with <i>unclosed italic</i>");
});
