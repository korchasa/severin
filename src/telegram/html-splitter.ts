import { DOMParser, Element, Node } from "deno-dom";
import { escapeHtml } from "./telegram-format.ts";

export class HtmlSplitter {
  private chunks: string[] = [];
  private currentChunk: string = "";
  private openTags: { tagName: string; attributes: string }[] = [];
  private readonly maxLength: number;
  private readonly continuationMarker: string;

  constructor(maxLength: number, continuationMarker: string = "\n\n<i>... (continued)</i>") {
    this.maxLength = maxLength;
    this.continuationMarker = continuationMarker;
  }

  public split(html: string): string[] {
    this.chunks = [];
    this.currentChunk = "";
    this.openTags = [];

    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) {
      throw new Error("Failed to parse HTML");
    }

    // Process all child nodes of the body
    const body = doc.body;
    if (body) {
      for (const node of body.childNodes) {
        this.processNode(node);
      }
    }

    if (this.currentChunk.length > 0) {
      this.chunks.push(this.currentChunk);
    }

    return this.chunks;
  }

  private processNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      this.processTextNode(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      this.processElementNode(node as Element);
    }
  }

  private processTextNode(node: Node) {
    let text = node.textContent || "";
    // Escape text immediately because we are building HTML
    text = escapeHtml(text);

    while (text.length > 0) {
      const closingTagsLength = this.calculateClosingTagsLength();
      // We need to ensure we can close all tags and add continuation marker
      const overhead = this.continuationMarker.length + closingTagsLength;
      const availableSpace = this.maxLength - this.currentChunk.length - overhead;

      if (availableSpace <= 0) {
        this.completeChunk();
        continue;
      }

      if (text.length <= availableSpace) {
        this.currentChunk += text;
        text = "";
      } else {
        // Split text
        const splitText = text.substring(0, availableSpace);
        this.currentChunk += splitText;
        text = text.substring(availableSpace);
        this.completeChunk();
      }
    }
  }

  private processElementNode(element: Element) {
    const tagName = element.tagName.toLowerCase();
    const attributes = this.getAttributesString(element);
    const openingTag = `<${tagName}${attributes}>`;
    const closingTag = `</${tagName}>`;

    // Check if opening tag fits
    const closingTagsLength = this.calculateClosingTagsLength();
    // Note: we don't include the NEW closing tag in overhead yet, because it's not open yet.
    // But once we open it, we will need space for it.
    // So effectively we need space for openingTag + closingTag (eventually) + current overhead
    // But strictly speaking, for the *current* chunk to be valid, we just need to fit openingTag.
    // However, if we fit openingTag but can't fit anything else, we'll just split immediately inside.

    // Let's just check if adding openingTag pushes us over the limit considering we might need to close it immediately if we split?
    // If we split immediately after opening, we need space for `</tagName>` + overhead.

    const overhead = this.continuationMarker.length + closingTagsLength;

    if (this.currentChunk.length + openingTag.length + overhead > this.maxLength) {
      this.completeChunk();
    }

    this.currentChunk += openingTag;
    this.openTags.push({ tagName, attributes });

    for (const child of element.childNodes) {
      this.processNode(child);
    }

    this.openTags.pop();
    this.currentChunk += closingTag;

    // If adding closing tag pushed us over limit?
    // We don't check here because `processTextNode` and recursive calls should have handled splitting.
    // The only case is if `closingTag` itself is huge or we were right at the limit.
    // If we are over limit now, it's too late to split *before* the closing tag cleanly without reopening logic.
    // But since we just popped the tag, we don't need to reopen it in next chunk.
    // So if we are over limit, we just let it be?
    // Or we should have reserved space for closing tag?
    // `processTextNode` reserves space for *currently open* tags.
    // When we are in `processTextNode` inside this element, `tagName` is in `openTags`, so we reserved space for `</tagName>`.
    // So we should be safe!
  }

  private completeChunk() {
    // Close all open tags
    const closingTags = this.openTags.slice().reverse().map((t) => `</${t.tagName}>`).join("");
    this.currentChunk += closingTags;
    this.currentChunk += this.continuationMarker;
    this.chunks.push(this.currentChunk);

    // Start new chunk
    this.currentChunk = "";
    // Reopen tags
    const openingTags = this.openTags.map((t) => `<${t.tagName}${t.attributes}>`).join("");
    this.currentChunk += openingTags;
  }

  private calculateClosingTagsLength(): number {
    return this.openTags.reduce((acc, t) => acc + t.tagName.length + 3, 0); // </tag> is length + 3
  }

  private getAttributesString(element: Element): string {
    const attrs = element.getAttributeNames();
    if (!attrs || attrs.length === 0) return "";
    return " " + attrs.map((name: string) => {
      const value = element.getAttribute(name);
      // Escape quotes in value if necessary
      const escapedValue = value ? value.replace(/"/g, "&quot;") : "";
      return `${name}="${escapedValue}"`;
    }).join(" ");
  }
}
