/**
 * Unit tests for PromptRenderer class
 */

import { assertEquals } from "@std/assert";
import { PromptRenderer } from "./prompt-renderer.ts";

Deno.test("PromptRenderer - renders base prompt only", () => {
  const basePrompt = "You are a home server agent.";
  const renderer = new PromptRenderer(basePrompt);
  const toolsInfo = "- terminal: Execute system commands safely.";

  const result = renderer.render(toolsInfo);

  const expected = `<system>
You are a home server agent.

## Available tools
- terminal: Execute system commands safely.
</system>`;

  assertEquals(result, expected);
});

Deno.test("PromptRenderer - renders with additional prompt", () => {
  const basePrompt = "You are a home server agent.";
  const additionalPrompt = "Always be helpful and polite.";
  const renderer = new PromptRenderer(basePrompt, additionalPrompt);
  const toolsInfo = "- terminal: Execute system commands safely.";

  const result = renderer.render(toolsInfo);

  const expected = `<system>
You are a home server agent.

Always be helpful and polite.

## Available tools
- terminal: Execute system commands safely.
</system>`;

  assertEquals(result, expected);
});

Deno.test("PromptRenderer - renders with system info", () => {
  const basePrompt = "You are a home server agent.";
  const systemInfo = "OS: Linux\nCPU: Intel i7\nMemory: 16GB";
  const renderer = new PromptRenderer(basePrompt, undefined, systemInfo);
  const toolsInfo = "- terminal: Execute system commands safely.";

  const result = renderer.render(toolsInfo);

  const expected = `<system>
You are a home server agent.

## System Information
OS: Linux
CPU: Intel i7
Memory: 16GB

## Available tools
- terminal: Execute system commands safely.
</system>`;

  assertEquals(result, expected);
});

Deno.test("PromptRenderer - renders with all components", () => {
  const basePrompt = "You are a home server agent.";
  const additionalPrompt = "Always be helpful and polite.";
  const systemInfo = "OS: Linux\nCPU: Intel i7\nMemory: 16GB";
  const renderer = new PromptRenderer(basePrompt, additionalPrompt, systemInfo);
  const toolsInfo = "- terminal: Execute system commands safely.\n- file: Read and write files.";

  const result = renderer.render(toolsInfo);

  const expected = `<system>
You are a home server agent.

Always be helpful and polite.

## System Information
OS: Linux
CPU: Intel i7
Memory: 16GB

## Available tools
- terminal: Execute system commands safely.
- file: Read and write files.
</system>`;

  assertEquals(result, expected);
});

Deno.test("PromptRenderer - renders with empty tools info", () => {
  const basePrompt = "You are a home server agent.";
  const additionalPrompt = "Always be helpful and polite.";
  const systemInfo = "OS: Linux";
  const renderer = new PromptRenderer(basePrompt, additionalPrompt, systemInfo);
  const toolsInfo = "";

  const result = renderer.render(toolsInfo);

  const expected = `<system>
You are a home server agent.

Always be helpful and polite.

## System Information
OS: Linux

## Available tools

</system>`;

  assertEquals(result, expected);
});

Deno.test("PromptRenderer - renders with complex tools description", () => {
  const basePrompt = "You are a helpful assistant.";
  const renderer = new PromptRenderer(basePrompt);
  const toolsInfo = `- terminal: Execute shell commands safely with validation and limits
- file_read: Read file contents from the filesystem
- file_write: Write content to files on the system`;

  const result = renderer.render(toolsInfo);

  const expected = `<system>
You are a helpful assistant.

## Available tools
- terminal: Execute shell commands safely with validation and limits
- file_read: Read file contents from the filesystem
- file_write: Write content to files on the system
</system>`;

  assertEquals(result, expected);
});
