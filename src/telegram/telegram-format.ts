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
 * States for the finite state machine used in markdownToTelegramMarkdownV2
 */
enum FSMState {
  NORMAL = "normal",
  INLINE_CODE = "inline_code",
  FENCED_CODE = "fenced_code",
  LINK_TEXT = "link_text",
  LINK_URL = "link_url",
  HEADER = "header",
  BOLD = "bold",
  ITALIC = "italic",
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
 *
 * Implementation uses a finite state machine for clear state transitions.
 */
export function markdownToTelegramMarkdownV2(
  input: string | null | undefined,
): string {
  if (!input) return "";

  let result = "";
  let state = FSMState.NORMAL;
  let i = 0;
  let isStartOfLine = true;

  while (i < input.length) {
    const char = input[i];
    const nextChar = i + 1 < input.length ? input[i + 1] : "";
    const prevChar = i > 0 ? input[i - 1] : "";

    switch (state) {
      case FSMState.NORMAL: {
        if (char === "`" && nextChar === "`" && input[i + 2] === "`") {
          // Start of fenced code block
          result += "```";
          state = FSMState.FENCED_CODE;
          i += 3;
          continue;
        } else if (char === "`") {
          // Start of inline code
          result += "`";
          state = FSMState.INLINE_CODE;
          i++;
          continue;
        } else if (char === "[" && prevChar !== "\\") {
          // Start of link
          result += "[";
          state = FSMState.LINK_TEXT;
          i++;
          continue;
        } else if (isStartOfLine && char === "#" && /^#{1,6}\s/.test(input.slice(i))) {
          // Start of header - convert to bold
          result += "*";
          state = FSMState.HEADER;
          // Skip the # characters and space
          while (i < input.length && (input[i] === "#" || input[i] === " ")) {
            i++;
          }
          continue;
        } else if (char === "*" && nextChar === "*") {
          // Start of bold
          result += "*";
          state = FSMState.BOLD;
          i += 2;
          continue;
        } else if (
          (char === "*" || char === "_") && !isBoldDelimiter(char, nextChar) &&
          isItalicStart(char, prevChar)
        ) {
          // Start of italic (but not bold)
          result += "_";
          state = FSMState.ITALIC;
          i++;
          continue;
        } else {
          // Regular character - escape if needed
          result += escapeCharIfNeeded(char);
          if (char === "\n") {
            isStartOfLine = true;
          } else if (!/\s/.test(char)) {
            isStartOfLine = false;
          }
          i++;
          continue;
        }
      }

      case FSMState.INLINE_CODE: {
        if (char === "`") {
          // End of inline code
          result += "`";
          state = FSMState.NORMAL;
        } else {
          // Inside code - no escaping
          result += char;
        }
        i++;
        continue;
      }

      case FSMState.FENCED_CODE: {
        if (char === "`" && nextChar === "`" && input[i + 2] === "`") {
          // End of fenced code block
          result += "```";
          state = FSMState.NORMAL;
          i += 3;
        } else {
          // Inside code block - no escaping
          result += char;
          i++;
        }
        continue;
      }

      case FSMState.LINK_TEXT: {
        if (char === "]" && nextChar === "(") {
          // End of link text, start of URL
          result += "](";
          state = FSMState.LINK_URL;
          i += 2;
        } else {
          // Inside link text - no escaping
          result += char;
          i++;
        }
        continue;
      }

      case FSMState.LINK_URL: {
        if (char === ")") {
          // End of link URL
          result += ")";
          state = FSMState.NORMAL;
        } else {
          // Inside link URL - no escaping
          result += char;
        }
        i++;
        continue;
      }

      case FSMState.HEADER: {
        if (char === "\n") {
          // End of header line
          result += "*\n";
          state = FSMState.NORMAL;
          isStartOfLine = true;
        } else {
          // Inside header - no escaping
          result += char;
          isStartOfLine = false;
        }
        i++;
        continue;
      }

      case FSMState.BOLD: {
        if (char === "*" && nextChar === "*") {
          // End of bold
          result += "*";
          state = FSMState.NORMAL;
          i += 2;
        } else {
          // Inside bold - no escaping
          result += char;
          i++;
        }
        continue;
      }

      case FSMState.ITALIC: {
        if ((char === "*" || char === "_") && !isBoldDelimiter(char, nextChar)) {
          // End of italic
          result += "_";
          state = FSMState.NORMAL;
          i++;
        } else {
          // Inside italic - no escaping
          result += char;
          i++;
        }
        continue;
      }
    }
  }

  // Handle unclosed states at end of input
  switch (state) {
    case FSMState.HEADER:
      result += "*";
      break;
    case FSMState.BOLD:
      result += "*";
      break;
    case FSMState.ITALIC:
      result += "_";
      break;
  }

  // Final pass: escape single underscores that are not part of italic formatting
  return escapeSingleUnderscores(result);
}

/**
 * Check if character sequence represents bold delimiter (**)
 */
function isBoldDelimiter(char: string, nextChar: string): boolean {
  return char === "*" && nextChar === "*";
}

/**
 * Check if character can start italic formatting
 * Italic starts after whitespace, punctuation, or at the beginning
 */
function isItalicStart(_char: string, prevChar: string): boolean {
  // Allow italic to start at the beginning of input or after whitespace/punctuation
  return prevChar === "" || /\s|[({[\].,!?;:]/.test(prevChar);
}

/**
 * Escape special characters that need escaping in Telegram MarkdownV2
 * Characters to escape: ~ > # + - = | { } . ! (excluding _ * [ ] ` \ which are used in formatting)
 */
function escapeCharIfNeeded(char: string): string {
  const charsToEscape = "~>#+-=|{}!.()";
  return charsToEscape.includes(char) ? "\\" + char : char;
}

/**
 * Escape single underscores that are not part of italic formatting to prevent unclosed entities
 */
function escapeSingleUnderscores(text: string): string {
  // Collect all italic and link matches
  const italicMatches: string[] = [];
  const linkMatches: string[] = [];

  // Replace italic and links with placeholders (using unique symbols)
  let result = text.replace(/_([^_]+)_/g, (match) => {
    const idx = italicMatches.push(match) - 1;
    return `\x00ITALIC${idx}\x00`;
  }).replace(/\[(.*?)\]\((.*?)\)/g, (match) => {
    const idx = linkMatches.push(match) - 1;
    return `\x00LINK${idx}\x00`;
  });

  // Escape all remaining underscores
  result = result.replace(/_/g, "\\_");

  // Restore italic and links
  for (let i = italicMatches.length - 1; i >= 0; i--) {
    result = result.replace(new RegExp(`\\x00ITALIC${i}\\x00`, "g"), italicMatches[i]);
  }
  for (let i = linkMatches.length - 1; i >= 0; i--) {
    result = result.replace(new RegExp(`\\x00LINK${i}\\x00`, "g"), linkMatches[i]);
  }

  return result;
}
