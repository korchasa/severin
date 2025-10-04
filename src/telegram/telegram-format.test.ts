import { assert, assertEquals } from "@std/assert";
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

Deno.test("markdownToTelegramHTML - code blocks preserve markdown inside", () => {
  const input = `\`\`\`bash
# List running Docker containers to find Homeassistant
docker ps --filter name=homeassistant

**If found, fetch recent logs**
docker logs --tail 50 <container_name>

**Check Homeassistant config directory for errors (if path known)**
echo "e.g. cat /path/to/homeassistant/config/home-assistant.log | tail -n 50"
\`\`\``;
  const out = markdownToTelegramHTML(input);
  // The **bold** inside code blocks should NOT be converted to <b> tags
  assert(
    out.includes("# List running Docker containers to find Homeassistant"),
    "Should contain original text",
  );
  assert(
    out.includes("**If found, fetch recent logs**"),
    "Should preserve **bold** inside code blocks",
  );
  assert(
    out.includes("**Check Homeassistant config directory for errors (if path known)**"),
    "Should preserve **bold** inside code blocks",
  );
  assert(
    out.includes(
      "echo &quot;e.g. cat /path/to/homeassistant/config/home-assistant.log | tail -n 50&quot;",
    ),
    "Should preserve the echo command",
  );
  // Should start and end with proper HTML tags
  assert(
    out.startsWith('<pre><code class="language-bash">'),
    "Should start with proper code block HTML",
  );
  assert(out.endsWith("</code></pre>"), "Should end with proper code block HTML");
});

Deno.test("markdownToTelegramHTML - code blocks preserve all markdown syntax inside", () => {
  const input = `\`\`\`markdown
# Header inside code
## Another header
*Italic text* and _more italic_
**Bold text** and ***bold italic***
[Simple link](README.md)
[Complex link](https://api.example.com?param=value&other=test)
\`inline code\`
> Blockquote with _italic_ text
Normal text with ***mixed*** \`code\` and [links](url)
\`\`\``;
  const out = markdownToTelegramHTML(input);

  // All markdown syntax should be preserved inside code blocks (HTML escaped where needed)
  assert(
    out.includes("# Header inside code"),
    "Should preserve header syntax inside code blocks",
  );
  assert(
    out.includes("## Another header"),
    "Should preserve multiple header levels inside code blocks",
  );
  assert(
    out.includes("*Italic text* and _more italic_"),
    "Should preserve italic syntax inside code blocks",
  );
  assert(
    out.includes("**Bold text** and ***bold italic***"),
    "Should preserve bold syntax inside code blocks",
  );
  assert(
    out.includes("[Simple link](README.md)"),
    "Should preserve simple link syntax inside code blocks",
  );
  assert(
    out.includes("[Complex link](https://api.example.com?param=value&amp;other=test)"),
    "Should preserve complex link syntax inside code blocks (HTML escaped)",
  );
  assert(
    out.includes("`inline code`"),
    "Should preserve inline code syntax inside code blocks",
  );
  assert(
    out.includes("&gt; Blockquote with _italic_ text"),
    "Should preserve blockquote syntax inside code blocks (HTML escaped)",
  );
  assert(
    out.includes("Normal text with ***mixed*** `code` and [links](url)"),
    "Should preserve complex combinations of markdown syntax inside code blocks",
  );

  // Should start and end with proper HTML tags
  assert(
    out.startsWith('<pre><code class="language-markdown">'),
    "Should start with proper code block HTML",
  );
  assert(out.endsWith("</code></pre>"), "Should end with proper code block HTML");
});

Deno.test("markdownToTelegramHTML - mixed content with code blocks and regular markdown", () => {
  const input = `# Main Header

This is **bold** text and *italic* text.

\`\`\`bash
# This is a comment inside code
echo "Hello **bold** *italic* [link](url)"
\`\`\`

Back to normal text with [a link](https://example.com).

> Blockquote with _italic_ text
`;
  const out = markdownToTelegramHTML(input);

  // Regular markdown outside code blocks should be converted
  assert(
    out.includes("<b>Main Header</b>"),
    "Headers outside code blocks should be converted",
  );
  assert(
    out.includes("<b>bold</b> text and <i>italic</i>"),
    "Bold and italic outside code blocks should be converted",
  );
  assert(
    out.includes('<a href="https://example.com">a link</a>'),
    "Links outside code blocks should be converted",
  );
  assert(
    out.includes("<blockquote>Blockquote with _italic_ text</blockquote>"),
    "Blockquotes outside code blocks should preserve internal markdown",
  );

  // Markdown inside code blocks should be preserved (HTML escaped)
  assert(
    out.includes("echo &quot;Hello **bold** *italic* [link](url)&quot;"),
    "Markdown syntax inside code blocks should be preserved (HTML escaped)",
  );

  // Code block structure should be correct
  assert(
    out.includes('<pre><code class="language-bash">'),
    "Should have proper code block opening tag",
  );
  assert(
    out.includes("</code></pre>"),
    "Should have proper code block closing tag",
  );
});
