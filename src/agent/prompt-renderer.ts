/**
 * PromptRenderer class for composing LLM system prompts.
 * Handles composition of base prompt, additional instructions, system information, and tools.
 */

import type { IPromptRenderer } from "../core/types.ts";

/**
 * Renders LLM system prompts by composing base prompt, additional instructions,
 * system information, and available tools into a structured format.
 */
export class PromptRenderer implements IPromptRenderer {
  private readonly basePrompt: string;
  private readonly additionalPrompt?: string;
  private readonly systemInfo?: string;

  /**
   * Creates a new PromptRenderer instance.
   * @param basePrompt - Base system prompt defining agent behavior
   * @param additionalPrompt - Optional additional instructions for agent behavior customization
   * @param systemInfo - Optional system information to include in the prompt
   */
  constructor(
    basePrompt: string,
    additionalPrompt?: string,
    systemInfo?: string,
  ) {
    this.basePrompt = basePrompt;
    this.additionalPrompt = additionalPrompt;
    this.systemInfo = systemInfo;
  }

  /**
   * Renders the complete system prompt by composing all components.
   * @param toolsInfo - Description of available tools for the LLM
   * @returns Complete system prompt with all components structured
   */
  render(toolsInfo: string): string {
    const parts: string[] = [];

    // Base prompt
    parts.push(this.basePrompt);

    // Additional prompt if provided
    if (this.additionalPrompt) {
      parts.push("");
      parts.push(this.additionalPrompt);
    }

    // System information if provided
    if (this.systemInfo) {
      parts.push("");
      parts.push("## System Information");
      parts.push(this.systemInfo);
    }

    // Tools information
    parts.push("");
    parts.push("## Available tools");
    parts.push(toolsInfo);

    // Wrap in system tags
    return `<system>\n${parts.join("\n")}\n</system>`;
  }
}
