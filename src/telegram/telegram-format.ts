/**
 * Telegram MarkdownV2 formatting helpers
 * Centralized escaping per Telegram rules: https://core.telegram.org/bots/api#markdownv2-style
 */

/**
 * Escapes text for safe usage with Telegram MarkdownV2 parse mode.
 * Escapes the following characters: _ * [ ] ( ) ~ ` > # + - = | { } . ! and backslash itself.
 *
 * @param text - raw message text
 * @returns escaped text safe for MarkdownV2
 */
export function escapeMarkdownV2(text: string): string {
  // Order matters: escape backslash first to avoid double-escaping
  const backslashEscaped = text.replaceAll(/\\/g, "\\\\");
  return backslashEscaped.replaceAll(/([_\*\[\]\(\)~`>#+\-=|{}\.!])/g, "\\$1");
}

/**
 * Escapes text and wraps it into a code block (```), suitable for logs or diagnostics.
 * Backticks inside are not allowed in MarkdownV2 code blocks, so they are removed.
 *
 * @param text - raw code text
 * @returns safe code block string
 */
export function toCodeBlock(text: string): string {
  const cleaned = text.replaceAll(/`/g, "");
  return "```\n" + cleaned + "\n```";
}

/**
 * Convert standard Markdown (subset) to Telegram MarkdownV2-compatible formatting without
 * over-escaping. The goal is to preserve common LLM formatting:
 * - # ## ### #### ##### ###### Header -> *Header* (headers converted to bold)
 * - **bold**  -> *bold*
 * - *italic*  -> _italic_
 * - _italic_  -> _italic_
 * - `code` and ```fences``` preserved
 * - [text](url) preserved
 * - blockquotes '>' and lists preserved
 *
 * Note: This is a minimal PoC converter focused on basic constructs and avoiding
 * modifications inside code blocks and inline code. Headers are converted to bold
 * text to maintain visual prominence in Telegram messages.
 */
export function markdownToTelegramMarkdownV2(input: string): string {
  if (!input) return input;

  // Split by fenced code blocks (```...```), keep delimiters
  const parts = input.split(/(```[\s\S]*?```)/g);

  const transformNonCode = (segment: string): string => {
    if (!segment) return segment;

    // Protect inline code spans `...` using safe placeholders
    const codePlaceholders: string[] = [];
    const CODE_TAG = "__PLACEHOLDER_CODE_";
    let protectedSegment = segment.replace(/`([^`]+)`/g, (_m, p1) => {
      const idx = codePlaceholders.push("`" + p1 + "`") - 1;
      return CODE_TAG + idx + "__";
    });

    // Protect links [text](url)
    const linkPlaceholders: string[] = [];
    const LINK_TAG = "__PLACEHOLDER_LINK_";
    protectedSegment = protectedSegment.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
      const idx = linkPlaceholders.push("[" + text + "](" + url + ")") - 1;
      return LINK_TAG + idx + "__";
    });

    // Protect headers: temporarily replace with placeholders to avoid conflicts with italic processing
    // Headers (# ## ### etc.) are converted to bold text (*text*) for visual prominence in Telegram
    const headerPlaceholders: string[] = [];
    const HEADER_TAG = "__PLACEHOLDER_HEADER_";
    protectedSegment = protectedSegment.replace(/^#{1,6}\s+(.+)$/gm, (_m, text) => {
      const idx = headerPlaceholders.push("*" + text + "*") - 1;
      return HEADER_TAG + idx + "__";
    });

    // Italic (asterisks): *text* (but not already bold) -> _text_
    let tmp = protectedSegment.replace(
      /(^|[^*])\*(?!\*)([^*]+)\*(?!\*)/g,
      (_m, pre, body) => `${pre}_${body}_`,
    );

    // Bold: **text** -> *text*
    tmp = tmp.replace(/\*\*([^*]+)\*\*/g, "*$1*");

    // Restore headers, links and inline code
    tmp = tmp.replace(
      new RegExp(HEADER_TAG + "(\\d+)__", "g"),
      (_m, i) => headerPlaceholders[Number(i)],
    );
    tmp = tmp.replace(
      new RegExp(LINK_TAG + "(\\d+)__", "g"),
      (_m, i) => linkPlaceholders[Number(i)],
    );
    tmp = tmp.replace(
      new RegExp(CODE_TAG + "(\\d+)__", "g"),
      (_m, i) => codePlaceholders[Number(i)],
    );

    return tmp;
  };

  const result = parts
    .map((part) => (part.startsWith("```") ? part : transformNonCode(part)))
    .join("");

  // Final escaping: escape remaining special characters that are not part of MarkdownV2 formatting
  // Characters to escape: ~ > # + - = | { } . ! (excluding _ * [ ] ` which are used in formatting)
  // But don't escape inside URLs in links: skip content inside [text](url)
  let final = "";
  let i = 0;
  while (i < result.length) {
    if (result[i] === "[" && i > 0 && result[i - 1] !== "\\") {
      // Possible link start, find matching ] and then (
      const bracketStart = i;
      i++;
      while (i < result.length && result[i] !== "]") {
        i++;
      }
      if (
        i < result.length && result[i] === "]" && i + 1 < result.length && result[i + 1] === "("
      ) {
        // This is [text](url), copy the entire link without escaping
        const linkStart = bracketStart;
        let parens = 0;
        while (i < result.length) {
          if (result[i] === "(") parens++;
          else if (result[i] === ")") {
            parens--;
            if (parens === 0) {
              i++; // include the )
              break;
            }
          }
          i++;
        }
        final += result.slice(linkStart, i);
      } else {
        // Not a link, process normally
        i = bracketStart;
        const char = result[i];
        if ("~>#+-=|{}!.\\(\\)".includes(char)) {
          final += "\\" + char;
        } else {
          final += char;
        }
        i++;
      }
    } else {
      const char = result[i];
      if ("~>#+-=|{}!.\\(\\)".includes(char)) {
        final += "\\" + char;
      } else {
        final += char;
      }
      i++;
    }
  }

  return final;
}
