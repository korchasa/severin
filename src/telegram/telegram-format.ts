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

  // Process code blocks first to avoid corrupting content
  let text = input;

  // 1) Extract blockquotes and set placeholders to avoid formatting their content
  const bqStore: string[] = [];
  text = text.replace(/(^> .*(?:\n> .*)*)/gm, (block) => {
    const idx = bqStore.push(block) - 1;
    return `__BQ${idx}__`;
  });

  // Fenced code with optional language
  text = text.replace(/```([a-zA-Z0-9_+\-]+)?\n([\s\S]*?)```/g, (_m, lang, code) => {
    const trimmed = String(code).replace(/\n$/, "");
    return toPreCode({ code: trimmed, language: lang });
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`);

  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safeUrl = escapeHtml(url);
    const safeLabel = escapeHtml(label);
    return `<a href="${safeUrl}">${safeLabel}</a>`;
  });

  // Headers at line start -> bold line
  text = text.replace(/^#{1,6}\s+(.*)$/gm, (_m, hdr) => `<b>${escapeHtml(hdr)}</b>`);

  // Bold **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, (_m, bold) => `<b>${escapeHtml(bold)}</b>`);

  // Italic *text* or _text_
  function replaceItalics(text: string, pattern: RegExp): string {
    return text.replace(pattern, (_m, pre, it) => `${pre}<i>${escapeHtml(it)}</i>`);
  }
  text = replaceItalics(text, /(^|\W)\*([^*]+)\*(?=\W|$)/g);
  text = replaceItalics(text, /(^|\W)_([^_]+)_(?=\W|$)/g);

  // 3) Restore blockquotes from placeholders without additional formatting
  if (bqStore.length > 0) {
    text = text.replace(/__BQ(\d+)__/g, (_m, sidx) => {
      const idx = parseInt(sidx, 10);
      if (isNaN(idx) || idx < 0 || idx >= bqStore.length) {
        return "";
      }
      const block = bqStore[idx];
      const lines = block.split(/\n/).map((l) => l.replace(/^>\s?/, ""));
      return `<blockquote>${escapeHtml(lines.join("\n"))}</blockquote>`;
    });
  }

  // Unclosed trailing underscore italic till EOL
  text = text.replace(/(^|\W)_([^_\n]+)$/gm, (_m, pre, it) => `${pre}<i>${escapeHtml(it)}</i>`);

  return text;
}
