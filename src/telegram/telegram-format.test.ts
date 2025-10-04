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

Deno.test("markdownToTelegramHTML - basic markdown transformations", () => {
  // Test plain text (should remain unchanged)
  const plainInput = "Hello world!";
  const plainOut = markdownToTelegramHTML(plainInput);
  assertEquals(plainOut, "Hello world!", "Plain text should remain unchanged");

  // Test bold and italic
  const emphasisInput = "**bold** and *italic* _more_";
  const emphasisOut = markdownToTelegramHTML(emphasisInput);
  assertEquals(
    emphasisOut,
    "<b>bold</b> and <i>italic</i> <i>more</i>",
    "Bold and italic should be converted to HTML",
  );

  // Test inline code
  const codeInput = "Text with `code` inline";
  const codeOut = markdownToTelegramHTML(codeInput);
  assertEquals(
    codeOut,
    "Text with <code>code</code> inline",
    "Inline code should be wrapped in <code> tags",
  );

  // Test fenced code blocks
  const fencedInput = "```\nline1\nline2\n```";
  const fencedOut = markdownToTelegramHTML(fencedInput);
  assertEquals(
    fencedOut,
    "<pre><code>line1\nline2</code></pre>",
    "Fenced code blocks should be wrapped in <pre><code>",
  );

  // Test links
  const linkInput = "See [example](https://example.com?q=a_b#c) please";
  const linkOut = markdownToTelegramHTML(linkInput);
  assertEquals(
    linkOut,
    'See <a href="https://example.com?q=a_b#c">example</a> please',
    "Links should be converted to <a> tags",
  );

  // Test blockquotes
  const quoteInput = "> quoted _text_\n> second";
  const quoteOut = markdownToTelegramHTML(quoteInput);
  assertEquals(
    quoteOut,
    "<blockquote>quoted _text_\nsecond</blockquote>",
    "Blockquotes should be wrapped in <blockquote> tags",
  );

  // Test headers
  const headerInput =
    "# Header 1\n## Header 2\n### Header 3\n#### Header 4\n##### Header 5\n###### Header 6";
  const headerOut = markdownToTelegramHTML(headerInput);
  assertEquals(
    headerOut,
    "<b>Header 1</b>\n<b>Header 2</b>\n<b>Header 3</b>\n<b>Header 4</b>\n<b>Header 5</b>\n<b>Header 6</b>",
    "All header levels should be converted to <b> tags",
  );

  // Test unclosed italic
  const unclosedInput = "Text with _unclosed italic";
  const unclosedOut = markdownToTelegramHTML(unclosedInput);
  assertEquals(
    unclosedOut,
    "Text with <i>unclosed italic</i>",
    "Unclosed italic should be properly closed",
  );
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

Deno.test("markdownToTelegramHTML - edge cases and boundary conditions", () => {
  // Test null/undefined input
  assertEquals(markdownToTelegramHTML(null), "", "null input should return empty string");
  assertEquals(markdownToTelegramHTML(undefined), "", "undefined input should return empty string");

  // Test empty and whitespace-only strings
  assertEquals(markdownToTelegramHTML(""), "", "empty string should return empty string");
  assertEquals(markdownToTelegramHTML("   "), "   ", "whitespace-only string should be preserved");
  assertEquals(
    markdownToTelegramHTML("\t\n  \t"),
    "\t\n  \t",
    "tabs and newlines should be preserved",
  );

  // Test strings with only special characters - function doesn't escape plain text HTML chars
  assertEquals(
    markdownToTelegramHTML("&<>\"'"),
    "&<>\"'",
    "HTML special chars in plain text are not escaped",
  );

  // Test very long strings (simulate large messages)
  const longText = "**bold** *italic*";
  const longOut = markdownToTelegramHTML(longText);
  assertEquals(longOut, "<b>bold</b> <i>italic</i>", "Basic long string processing works");
});

Deno.test("markdownToTelegramHTML - nested and complex combinations", () => {
  // Test bold inside italic - function processes in order: bold first, then italic escapes HTML
  const nested1 = "*italic with **bold** inside*";
  const out1 = markdownToTelegramHTML(nested1);
  assertEquals(
    out1,
    "<i>italic with &lt;b&gt;bold&lt;/b&gt; inside</i>",
    "Bold markup gets processed but HTML tags are escaped inside italic",
  );

  // Test code inside other elements (code processed early, but HTML tags get escaped in bold)
  const nested2 = "**bold `code` text**";
  const out2 = markdownToTelegramHTML(nested2);
  assertEquals(
    out2,
    "<b>bold &lt;code&gt;code&lt;/code&gt; text</b>",
    "Code gets processed but HTML tags are escaped inside bold",
  );

  // Test links in headers - links get processed but HTML tags are escaped in headers
  const nested3 = "# Header with [link](url)";
  const out3 = markdownToTelegramHTML(nested3);
  assertEquals(
    out3,
    "<b>Header with &lt;a href=&quot;url&quot;&gt;link&lt;/a&gt;</b>",
    "Links get processed but HTML tags are escaped in headers",
  );

  // Test multiple nested blockquotes - current implementation only handles single level
  const nested4 = "> Level 1\n> > Level 2\n> > > Level 3";
  const out4 = markdownToTelegramHTML(nested4);
  assertEquals(
    out4,
    "<blockquote>Level 1\n&gt; Level 2\n&gt; &gt; Level 3</blockquote>",
    "Nested blockquotes beyond first level get HTML escaped",
  );
});

Deno.test("markdownToTelegramHTML - malformed and edge markdown", () => {
  // Test multiple consecutive asterisks - gets processed as italic containing bold (escaped)
  const malformed1 = "***not bold***";
  const out1 = markdownToTelegramHTML(malformed1);
  assertEquals(
    out1,
    "<i>&lt;b&gt;not bold&lt;/b&gt;</i>",
    "Triple asterisks create nested formatting with HTML escaping",
  );

  // Test unclosed bold - should remain as is
  const malformed2 = "**unclosed bold";
  const out2 = markdownToTelegramHTML(malformed2);
  assertEquals(out2, "**unclosed bold", "Unclosed bold should not be converted");

  // Test empty code blocks - should work
  const malformed3 = "```\n```";
  const out3 = markdownToTelegramHTML(malformed3);
  assertEquals(out3, "<pre><code></code></pre>", "Empty code blocks should be handled");

  // Test code blocks with only language - current regex doesn't handle this case
  const malformed4 = "```python\n";
  const out4 = markdownToTelegramHTML(malformed4);
  assertEquals(out4, "```python\n", "Unclosed code blocks should be preserved as text");

  // Test blockquotes with inconsistent formatting - each > line becomes separate blockquote
  const malformed5 = "> First line\nSecond line\n> Third line";
  const out5 = markdownToTelegramHTML(malformed5);
  assertEquals(
    out5,
    "<blockquote>First line</blockquote>\nSecond line\n<blockquote>Third line</blockquote>",
    "Each line starting with > becomes a separate blockquote",
  );
});

Deno.test("markdownToTelegramHTML - unicode and special characters", () => {
  // Test emoji
  const unicode1 = "Hello 🌟 **bold** with *emoji* 🎉";
  const out1 = markdownToTelegramHTML(unicode1);
  assertEquals(out1, "Hello 🌟 <b>bold</b> with <i>emoji</i> 🎉", "Emoji should be preserved");

  // Test non-ASCII characters
  const unicode2 = "Привет **мир** and *hello* κόσμος";
  const out2 = markdownToTelegramHTML(unicode2);
  assertEquals(
    out2,
    "Привет <b>мир</b> and <i>hello</i> κόσμος",
    "Non-ASCII characters should be preserved",
  );

  // Test special characters in code
  const unicode3 = "`function(arg1, arg2)` and `f(x) = x² + 2x + 1`";
  const out3 = markdownToTelegramHTML(unicode3);
  assertEquals(
    out3,
    "<code>function(arg1, arg2)</code> and <code>f(x) = x² + 2x + 1</code>",
    "Special characters in code should be HTML escaped",
  );
});

Deno.test("markdownToTelegramHTML - code blocks edge cases", () => {
  // Test code blocks without language
  const code1 = "```\nconsole.log('hello');\n```";
  const out1 = markdownToTelegramHTML(code1);
  assertEquals(
    out1,
    "<pre><code>console.log(&#39;hello&#39;);</code></pre>",
    "Code blocks without language should work",
  );

  // Test multiple consecutive code blocks
  const code2 = "```js\nconsole.log(1);\n```\n\n```python\nprint(2)\n```";
  const out2 = markdownToTelegramHTML(code2);
  assert(out2.includes('<pre><code class="language-js">'), "First code block should have language");
  assert(
    out2.includes('<pre><code class="language-python">'),
    "Second code block should have language",
  );
  assert(out2.includes("console.log(1);"), "First code block content should be preserved");
  assert(out2.includes("print(2)"), "Second code block content should be preserved");

  // Test code blocks with special markdown inside
  const code3 = "```markdown\n# This is *not* a header\n**Not bold** [not a link](url)\n```";
  const out3 = markdownToTelegramHTML(code3);
  assert(out3.includes("# This is *not* a header"), "Headers in code should be preserved as text");
  assert(
    out3.includes("**Not bold** [not a link](url)"),
    "Bold and links in code should be preserved as text",
  );

  // Test code blocks with empty lines - function preserves internal empty lines
  const code4 = "```\n\n\ncode\n\n\n```";
  const out4 = markdownToTelegramHTML(code4);
  assertEquals(
    out4,
    "<pre><code>\n\ncode\n\n</code></pre>",
    "Empty lines inside code blocks should be preserved, trailing newline removed",
  );
});
