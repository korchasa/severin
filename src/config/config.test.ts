/**
 * Configuration tests
 */

import { assertEquals, assertThrows } from "@std/assert";
import { createDefaultConfig } from "./config.ts";
import { env, toJSONWithoutPII } from "./utils.ts";
import { cachedConfig, clearConfigCache, loadConfig } from "./load.ts";

// Mock environment for testing
const originalEnv = Deno.env.toObject();

function setTestEnv(env: Record<string, string>) {
  clearConfigCache();
  // Clear all existing env vars
  for (const key of Object.keys(Deno.env.toObject())) {
    Deno.env.delete(key);
  }
  // Set test env vars
  for (const [key, value] of Object.entries(env)) {
    Deno.env.set(key, value);
  }
}

function restoreEnv() {
  clearConfigCache();
  // Restore original env
  for (const key of Object.keys(Deno.env.toObject())) {
    Deno.env.delete(key);
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
}

Deno.test("config: loadConfig caches configuration", () => {
  try {
    setTestEnv({
      TELEGRAM_BOT_TOKEN: "test_token",
      TELEGRAM_OWNER_IDS: "123456789",
      AGENT_LLM_API_KEY: "test_key",
    });

    // First call should parse and cache
    const config1 = loadConfig();
    assertEquals(cachedConfig, config1);
    assertEquals(config1.telegram.botToken, "test_token");

    // Second call should return cached value
    const config2 = loadConfig();
    assertEquals(config1, config2);
    assertEquals(cachedConfig, config1);
  } finally {
    restoreEnv();
  }
});

Deno.test("config: loadConfig validates required fields", () => {
  try {
    setTestEnv({
      // Missing required AGENT_LLM_API_KEY
      TELEGRAM_BOT_TOKEN: "test_token",
      TELEGRAM_OWNER_IDS: "123456789",
    });

    // Clear cache to ensure fresh validation
    clearConfigCache();

    assertThrows(
      () => loadConfig(),
      Error,
      "Required environment variable AGENT_LLM_API_KEY is not set",
    );
  } finally {
    restoreEnv();
  }
});

Deno.test("config: clearConfigCache resets cache", () => {
  try {
    setTestEnv({
      TELEGRAM_BOT_TOKEN: "test_token",
      TELEGRAM_OWNER_IDS: "123456789",
      AGENT_LLM_API_KEY: "test_key",
    });

    // Load config and verify it's cached
    const config1 = loadConfig();
    assertEquals(cachedConfig, config1);

    // Clear cache
    clearConfigCache();
    assertEquals(cachedConfig, null);

    // Load again - should parse fresh
    const config2 = loadConfig();
    assertEquals(cachedConfig, config2);
    assertEquals(config1.telegram.botToken, config2.telegram.botToken);
  } finally {
    restoreEnv();
  }
});

Deno.test("config: parses CSV owner IDs correctly", () => {
  try {
    setTestEnv({
      TELEGRAM_BOT_TOKEN: "test_token",
      TELEGRAM_OWNER_IDS: "123, 456 , 789 ",
      AGENT_LLM_API_KEY: "test_key",
    });

    const config = loadConfig();
    assertEquals(config.telegram.ownerIds, [123, 456, 789]);
  } finally {
    restoreEnv();
  }
});

Deno.test("config: handles .env file loading", () => {
  try {
    // Create a temporary .env file
    const envContent =
      "TELEGRAM_BOT_TOKEN=env_token\nTELEGRAM_OWNER_IDS=987\nAGENT_LLM_API_KEY=env_key\n";
    Deno.writeTextFileSync(".env", envContent);

    // Don't set env vars - should load from .env
    setTestEnv({
      TELEGRAM_BOT_TOKEN: "env_token",
      TELEGRAM_OWNER_IDS: "987",
      AGENT_LLM_API_KEY: "env_key",
    });

    const config = loadConfig();
    assertEquals(config.telegram.botToken, "env_token");
    assertEquals(config.agent.llm.apiKey, "env_key");
  } finally {
    restoreEnv();
    try {
      Deno.removeSync(".env");
    } catch {
      // Ignore if file doesn't exist
    }
  }
});

// Tests for new envReq and envDef functions
function testEnvVars(env: Record<string, string>) {
  // Clear all existing env vars
  for (const key of Object.keys(Deno.env.toObject())) {
    Deno.env.delete(key);
  }
  // Set test env vars
  for (const [key, value] of Object.entries(env)) {
    Deno.env.set(key, value);
  }
}

function clearTestEnvVars() {
  // Restore original env
  for (const key of Object.keys(Deno.env.toObject())) {
    Deno.env.delete(key);
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
}

Deno.test("config: env throws when variable is not set", () => {
  try {
    clearTestEnvVars();

    assertThrows(
      () => env("NON_EXISTENT_VAR"),
      Error,
      "Required environment variable NON_EXISTENT_VAR is not set",
    );
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: env returns string value when variable is set", () => {
  try {
    testEnvVars({ TEST_VAR: "test_value" });

    const result = env("TEST_VAR");
    assertEquals(result, "test_value");
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: env returns string value when variable is set with default", () => {
  try {
    testEnvVars({ TEST_VAR: "test_value" });

    const result = env("TEST_VAR", "default_value");
    assertEquals(result, "test_value");
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: env returns default when string variable is not set", () => {
  try {
    clearTestEnvVars();

    const result = env("NON_EXISTENT_VAR", "default_value");
    assertEquals(result, "default_value");
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: env returns number value when variable is set", () => {
  try {
    testEnvVars({ TEST_VAR: "123" });

    const result = env("TEST_VAR", 0);
    assertEquals(result, 123);
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: env returns number default when variable is not set", () => {
  try {
    clearTestEnvVars();

    const result = env("NON_EXISTENT_VAR", 42);
    assertEquals(result, 42);
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: env returns boolean value when variable is set", () => {
  try {
    testEnvVars({ TEST_VAR: "true" });

    const result = env("TEST_VAR", false);
    assertEquals(result, true);
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: env returns boolean default when variable is not set", () => {
  try {
    clearTestEnvVars();

    const result = env("NON_EXISTENT_VAR", true);
    assertEquals(result, true);
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: createDefaultConfig uses environment variables", () => {
  try {
    testEnvVars({
      TELEGRAM_BOT_TOKEN: "test_bot_token",
      TELEGRAM_OWNER_IDS: "123, 456",
      AGENT_LLM_API_KEY: "test_api_key",
      AGENT_DATA_DIR: "/custom/data",
      LOGGING_FORMAT: "json",
      AGENT_MEMORY_MAX_SYMBOLS: "10000",
      AGENT_TERMINAL_TIMEOUT_MS: "30000",
      AGENT_TERMINAL_MAX_COMMAND_OUTPUT_SIZE: "200000",
      AGENT_TERMINAL_MAX_LLM_INPUT_LENGTH: "2000",
      AGENT_LLM_PROVIDER: "custom_provider",
    });

    const config = createDefaultConfig();

    assertEquals(config.agent.dataDir, "/custom/data");
    assertEquals(config.telegram.botToken, "test_bot_token");
    assertEquals(config.telegram.ownerIds, [123, 456]);
    assertEquals(config.logging.format, "json");
    assertEquals(config.agent.history.maxSymbols, 10000);
    assertEquals(config.agent.terminal.timeoutMs, 30000);
    assertEquals(config.agent.terminal.maxCommandOutputSize, 200000);
    assertEquals(config.agent.terminal.maxLLMInputLength, 2000);
    assertEquals(config.agent.llm.provider, "custom_provider");
    assertEquals(config.agent.llm.apiKey, "test_api_key");
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: toJSONWithoutPII masks sensitive data", () => {
  try {
    testEnvVars({
      TELEGRAM_BOT_TOKEN: "1234567890abcdef",
      TELEGRAM_OWNER_IDS: "123456789",
      AGENT_LLM_API_KEY: "sk-1234567890abcdef",
    });

    const config = createDefaultConfig();
    const jsonWithoutPII = toJSONWithoutPII(config);
    const parsed = JSON.parse(jsonWithoutPII);

    // Check that sensitive data is masked
    assertEquals(parsed.telegram.botToken, "1234********cdef");
    assertEquals(parsed.agent.llm.apiKey, "sk-1***********cdef");

    // Check that non-sensitive data is preserved
    assertEquals(parsed.agent.dataDir, "./data");
    assertEquals(parsed.telegram.ownerIds, [123456789]);
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: createDefaultConfig uses defaults when env vars not set", () => {
  try {
    clearTestEnvVars();

    // This test should fail because required variables are not set
    assertThrows(
      () => createDefaultConfig(),
      Error,
      "Required environment variable AGENT_LLM_API_KEY is not set",
    );
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: createDefaultConfig throws on missing required variables", () => {
  try {
    clearTestEnvVars();

    assertThrows(
      () => createDefaultConfig(),
      Error,
      "Required environment variable AGENT_LLM_API_KEY is not set",
    );
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: additional prompt is included in system prompt when set", () => {
  try {
    testEnvVars({
      TELEGRAM_BOT_TOKEN: "test_token",
      TELEGRAM_OWNER_IDS: "123456789",
      AGENT_LLM_API_KEY: "test_key",
      AGENT_LLM_ADDITIONAL_PROMPT: "Always be polite and helpful.",
    });

    const config = createDefaultConfig();

    // Check that additional instructions are stored in config
    assertEquals(
      config.agent.llm.additionalPrompt.includes("Always be polite and helpful."),
      true,
    );
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: additional prompt section not included when not set", () => {
  try {
    testEnvVars({
      TELEGRAM_BOT_TOKEN: "test_token",
      TELEGRAM_OWNER_IDS: "123456789",
      AGENT_LLM_API_KEY: "test_key",
      // AGENT_LLM_ADDITIONAL_PROMPT not set
    });

    const config = createDefaultConfig();

    // Check that additional instructions are empty
    assertEquals(
      config.agent.llm.additionalPrompt,
      "",
    );
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: additional prompt trims whitespace", () => {
  try {
    testEnvVars({
      TELEGRAM_BOT_TOKEN: "test_token",
      TELEGRAM_OWNER_IDS: "123456789",
      AGENT_LLM_API_KEY: "test_key",
      AGENT_LLM_ADDITIONAL_PROMPT: "  Always be polite.  \n  And helpful.  ",
    });

    const config = createDefaultConfig();

    // Check that trimmed additional instructions are included
    assertEquals(
      config.agent.llm.additionalPrompt.includes("Always be polite."),
      true,
    );
    assertEquals(
      config.agent.llm.additionalPrompt.includes("And helpful."),
      true,
    );
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: empty additional prompt does not add section", () => {
  try {
    testEnvVars({
      TELEGRAM_BOT_TOKEN: "test_token",
      TELEGRAM_OWNER_IDS: "123456789",
      AGENT_LLM_API_KEY: "test_key",
      AGENT_LLM_ADDITIONAL_PROMPT: "",
    });

    const config = createDefaultConfig();

    // Check that additional instructions are empty string
    assertEquals(
      config.agent.llm.additionalPrompt,
      "",
    );
  } finally {
    clearTestEnvVars();
  }
});

Deno.test("config: whitespace-only additional prompt does not add section", () => {
  try {
    testEnvVars({
      TELEGRAM_BOT_TOKEN: "test_token",
      TELEGRAM_OWNER_IDS: "123456789",
      AGENT_LLM_API_KEY: "test_key",
      AGENT_LLM_ADDITIONAL_PROMPT: "   \n\t   ",
    });

    const config = createDefaultConfig();

    // Check that additional instructions are empty for whitespace-only string
    assertEquals(
      config.agent.llm.additionalPrompt,
      "",
    );
  } finally {
    clearTestEnvVars();
  }
});
