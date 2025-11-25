/**
 * Telegram HTML formatting helpers
 * Centralized HTML escaping and minimal Markdown→HTML conversion per Telegram HTML rules.
 * https://core.telegram.org/bots/api#html-style
 */

/**
 * Escapes HTML special characters for safe insertion into HTML text.
 */
export function escapeHtml(text: string): string {
  return String(text)
    .replaceAll(/&/g, "&amp;")
    .replaceAll(/</g, "&lt;")
    .replaceAll(/>/g, "&gt;")
    .replaceAll(/\"/g, "&quot;")
    .replaceAll(/'/g, "&#39;");
}

/**
 * Formats as a multiline code block.
 */
export function toPre(text: string): string {
  return `<pre>${escapeHtml(text)}</pre>`;
}

/**
 * Formats as a multiline code block with language highlighting (class language-<lang> on <code>).
 */
export function toPreCode(
  { code, language }: Readonly<{ code: string; language?: string }>,
): string {
  if (language && language.trim()) {
    const lang = escapeHtml(language.trim());
    return `<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`;
  }
  return `<pre><code>${escapeHtml(code)}</code></pre>`;
}

/**
 * Converts simplified Markdown to inline Telegram HTML.
 * Support:
 * - Headers #..###### → <b>…</b> line
 * - **bold** → <b>, *italic* or _italic_ → <i>
 * - `code` → <code>
 * - ```lang?\n...``` → <pre><code class="language-?">…</code></pre>
 * - [text](url) → <a href="url">text</a>
 * - > quote (multiline) → <blockquote>…</blockquote>
 */
export function markdownToTelegramHTML(input: string | null | undefined): string {
  if (!input) return "";

  const placeholders: string[] = [];
  const placeholder = (content: string) => {
    const idx = placeholders.push(content) - 1;
    return `__TG_PH_${idx}__`;
  };

  let text = input;

  // 1) Extract blockquotes
  text = text.replace(/(^> .*(?:\n> .*)*)/gm, (block) => {
    const lines = block.split(/\n/).map((l) => l.replace(/^>\s?/, ""));
    return placeholder(`<blockquote>${escapeHtml(lines.join("\n"))}</blockquote>`);
  });

  // 2) Fenced code with optional language
  text = text.replace(/```([a-zA-Z0-9_+\-]+)?\n([\s\S]*?)```/g, (_m, lang, code) => {
    const trimmed = String(code).replace(/\n$/, "");
    return placeholder(toPreCode({ code: trimmed, language: lang }));
  });

  // 3) Inline code
  text = text.replace(/`([^`]+)`/g, (_m, code) => placeholder(`<code>${escapeHtml(code)}</code>`));

  // 4) Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safeUrl = escapeHtml(url);
    const safeLabel = escapeHtml(label);
    return placeholder(`<a href="${safeUrl}">${safeLabel}</a>`);
  });

  // 5) Headers at line start -> bold line
  text = text.replace(/^#{1,6}\s+(.*)$/gm, (_m, hdr) => placeholder(`<b>${escapeHtml(hdr)}</b>`));

  // 6) Bold **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, (_m, bold) => placeholder(`<b>${escapeHtml(bold)}</b>`));

  // 7) Italic *text* or _text_
  function replaceItalics(text: string, pattern: RegExp): string {
    return text.replace(
      pattern,
      (_m, pre, it) => `${pre}${placeholder(`<i>${escapeHtml(it)}</i>`)}`,
    );
  }
  text = replaceItalics(text, /(^|\W)\*([^*]+)\*(?=\W|$)/g);
  text = replaceItalics(text, /(^|\W)_([^_]+)_(?=\W|$)/g);

  // Unclosed trailing underscore italic till EOL
  text = text.replace(
    /(^|\W)_([^_\n]+)$/gm,
    (_m, pre, it) => `${pre}${placeholder(`<i>${escapeHtml(it)}</i>`)}`,
  );

  // 8) Escape the remaining text
  text = escapeHtml(text);

  // 9) Restore placeholders
  // Loop until no placeholders remain to handle nesting
  while (text.includes("__TG_PH_")) {
    text = text.replace(/__TG_PH_(\d+)__/g, (_m, idxStr) => {
      const idx = parseInt(idxStr, 10);
      return placeholders[idx] || "";
    });
  }

  return text;
}
