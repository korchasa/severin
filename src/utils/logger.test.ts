/**
 * Logger infrastructure tests
 */

import {
  assertEquals,
  assertStringIncludes,
  assertStringIncludes as assertIncludes,
} from "@std/assert";
import {
  initializeLogger,
  log,
  logOutgoingMessage,
  logOutgoingMessageNoContext,
} from "./logger.ts";

// Mock console.log to capture output
let capturedLogs: string[] = [];
const originalConsoleLog = console.log;

function setupConsoleMock() {
  capturedLogs = [];
  console.log = (message: string) => {
    capturedLogs.push(message);
  };
}

function restoreConsoleMock() {
  console.log = originalConsoleLog;
}

Deno.test("logOutgoingMessage: logs outgoing message with context (JSON format)", () => {
  setupConsoleMock();

  try {
    initializeLogger("json");

    // Create mock context
    const mockCtx = {
      update: { update_id: 123 },
      chat: { id: 456 },
      message: { message_id: 789 },
      _cid: "test-correlation-id",
    } as unknown as Parameters<typeof logOutgoingMessage>[0];

    logOutgoingMessage(mockCtx, "reply", 456, "Hello world");

    assertEquals(capturedLogs.length, 1);
    const logData = JSON.parse(capturedLogs[0]);

    assertEquals(logData.mod, "tg");
    assertEquals(logData.event, "message_out");
    assertEquals(logData.method, "reply");
    assertEquals(logData.message_text, "Hello world");
  } finally {
    restoreConsoleMock();
  }
});

Deno.test("logOutgoingMessageNoContext: logs outgoing message without context (JSON format)", () => {
  setupConsoleMock();

  try {
    initializeLogger("json");

    logOutgoingMessageNoContext("sendMessage", 12345, "Test message");

    assertEquals(capturedLogs.length, 1);
    const logData = JSON.parse(capturedLogs[0]);

    assertEquals(logData.mod, "tg");
    assertEquals(logData.event, "message_out");
    assertEquals(logData.method, "sendMessage");
    assertEquals(logData.chat_id, 12345);
    assertEquals(logData.message_text, "Test message");
    assertEquals(logData.source, "scheduler");
  } finally {
    restoreConsoleMock();
  }
});

Deno.test("log: basic structured logging (pretty format by default)", () => {
  setupConsoleMock();

  try {
    // Reset to default pretty format
    initializeLogger("pretty");

    log({
      mod: "test",
      event: "test_event",
      custom_field: "custom_value",
    });

    assertEquals(capturedLogs.length, 1);
    const logLine = capturedLogs[0];

    // Pretty format should contain human-readable text
    assertIncludes(logLine, "TEST");
    assertIncludes(logLine, "test_event");
    assertIncludes(logLine, 'custom_field="custom_value"');
    assertIncludes(logLine, "["); // timestamp
  } finally {
    restoreConsoleMock();
  }
});

Deno.test("log: JSON format logging", () => {
  setupConsoleMock();

  try {
    initializeLogger("json");

    log({
      mod: "test",
      event: "json_event",
      custom_field: "json_value",
    });

    assertEquals(capturedLogs.length, 1);
    const logData = JSON.parse(capturedLogs[0]);

    assertEquals(logData.mod, "test");
    assertEquals(logData.event, "json_event");
    assertEquals(logData.custom_field, "json_value");
    assertStringIncludes(logData.ts, new Date().toISOString().slice(0, 10)); // Same date
  } finally {
    restoreConsoleMock();
  }
});

Deno.test("initializeLogger: sets format configuration", () => {
  setupConsoleMock();

  try {
    // Test pretty format
    initializeLogger("pretty");
    log({ mod: "test", event: "pretty_test" });
    assertIncludes(capturedLogs[0], "TEST");

    // Test JSON format (capturedLogs now has 2 entries)
    initializeLogger("json");
    log({ mod: "test", event: "json_test" });
    const logData = JSON.parse(capturedLogs[1]);
    assertEquals(logData.event, "json_test");
  } finally {
    restoreConsoleMock();
  }
});

Deno.test("pretty format: handles different field types", () => {
  setupConsoleMock();

  try {
    initializeLogger("pretty");

    log({
      mod: "test",
      event: "field_types",
      string_field: "string_value",
      number_field: 42,
      boolean_field: true,
      null_field: null,
      undefined_field: undefined,
    });

    assertEquals(capturedLogs.length, 1);
    const logLine = capturedLogs[0];

    assertIncludes(logLine, 'string_field="string_value"');
    assertIncludes(logLine, "number_field=42");
    assertIncludes(logLine, "boolean_field=true");
    assertIncludes(logLine, "TEST");
    assertIncludes(logLine, "field_types");

    // null and undefined should not appear
    assertEquals(logLine.includes("null_field"), false);
    assertEquals(logLine.includes("undefined_field"), false);
  } finally {
    restoreConsoleMock();
  }
});
