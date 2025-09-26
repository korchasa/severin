import { assertEquals } from "@std/assert";
import { executeTerminal, validateTerminal } from "./terminal.ts";

const TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 10000;
const MAX_STDOUT_LENGTH = 2000;

Deno.test("terminal: validation accepts valid commands", () => {
  const result = validateTerminal({ command: "ls -la", cwd: "/", reason: "test validation" });
  assertEquals(result.cmd, "ls -la");
  assertEquals(result.cwd, "/");
});

Deno.test("terminal: validation uses default cwd when not specified", () => {
  const result = validateTerminal({ command: "pwd", reason: "test default cwd" });
  assertEquals(result.cmd, "pwd");
  assertEquals(result.cwd, "/");
});

Deno.test("terminal: validation accepts shell commands with pipes", () => {
  const result = validateTerminal({
    command: "ls -la | grep test",
    cwd: "/tmp",
    reason: "test pipe validation",
  });
  assertEquals(result.cmd, "ls -la | grep test");
  assertEquals(result.cwd, "/tmp");
});

Deno.test("terminal: validation accepts commands with redirection", () => {
  const result = validateTerminal({
    command: "echo hello > output.txt",
    cwd: "/tmp",
    reason: "test redirection validation",
  });
  assertEquals(result.cmd, "echo hello > output.txt");
  assertEquals(result.cwd, "/tmp");
});

// Integration tests for executeTerminal
Deno.test("terminal: executeTerminal executes simple commands", async () => {
  const result = await executeTerminal(
    { command: "echo hello", reason: "test simple command" },
    TIMEOUT_MS,
    MAX_OUTPUT_BYTES,
    MAX_STDOUT_LENGTH,
  );

  assertEquals(result.exitCode, 0);
  assertEquals(result.stdout.trim(), "hello");
  assertEquals(result.command, "echo hello");
});

Deno.test("terminal: executeTerminal executes commands with pipes", async () => {
  const result = await executeTerminal(
    {
      command: "echo 'hello world' | grep hello",
      reason: "test pipe command",
    },
    TIMEOUT_MS,
    MAX_OUTPUT_BYTES,
    MAX_STDOUT_LENGTH,
  );

  assertEquals(result.exitCode, 0);
  assertEquals(result.stdout.trim(), "hello world");
  assertEquals(result.command, "echo 'hello world' | grep hello");
});

Deno.test("terminal: executeTerminal executes commands with redirection", async () => {
  const result = await executeTerminal(
    {
      command: "echo test > /tmp/test_output.txt && cat /tmp/test_output.txt",
      cwd: "/tmp",
      reason: "test redirection command",
    },
    TIMEOUT_MS,
    MAX_OUTPUT_BYTES,
    MAX_STDOUT_LENGTH,
  );

  assertEquals(result.exitCode, 0);
  assertEquals(result.stdout.trim(), "test");
  assertEquals(result.command, "echo test > /tmp/test_output.txt && cat /tmp/test_output.txt");
});

Deno.test("terminal: executeTerminal handles command failures", async () => {
  const result = await executeTerminal(
    { command: "false", reason: "test command failure" },
    TIMEOUT_MS,
    MAX_OUTPUT_BYTES,
    MAX_STDOUT_LENGTH,
  );

  assertEquals(result.exitCode, 1);
  assertEquals(result.command, "false");
});
