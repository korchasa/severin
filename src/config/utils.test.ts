/**
 * Tests for configuration utility functions
 */

import { assertEquals, assertThrows } from "@std/assert";
import { env, envNumberOptional, envOptional, parseOwnerIds, toJSONWithoutPII } from "./utils.ts";

// Mock environment for testing
const originalEnv = Deno.env.toObject();

function setTestEnv(env: Record<string, string>) {
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
  // Restore original env
  for (const key of Object.keys(Deno.env.toObject())) {
    Deno.env.delete(key);
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
}

// Tests for env function
Deno.test("utils: env throws when variable is not set", () => {
  try {
    restoreEnv();

    assertThrows(
      () => env("NON_EXISTENT_VAR"),
      Error,
      "Required environment variable NON_EXISTENT_VAR is not set",
    );
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: env returns string value when variable is set", () => {
  try {
    setTestEnv({ TEST_VAR: "test_value" });

    const result = env("TEST_VAR");
    assertEquals(result, "test_value");
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: env returns string value when variable is set with default", () => {
  try {
    setTestEnv({ TEST_VAR: "test_value" });

    const result = env("TEST_VAR", "default_value");
    assertEquals(result, "test_value");
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: env returns default when string variable is not set", () => {
  try {
    restoreEnv();

    const result = env("NON_EXISTENT_VAR", "default_value");
    assertEquals(result, "default_value");
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: env returns number value when variable is set", () => {
  try {
    setTestEnv({ TEST_VAR: "123" });

    const result = env("TEST_VAR", 0);
    assertEquals(result, 123);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: env returns number default when variable is not set", () => {
  try {
    restoreEnv();

    const result = env("NON_EXISTENT_VAR", 42);
    assertEquals(result, 42);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: env returns boolean value when variable is set", () => {
  try {
    setTestEnv({ TEST_VAR: "true" });

    const result = env("TEST_VAR", false);
    assertEquals(result, true);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: env returns boolean default when variable is not set", () => {
  try {
    restoreEnv();

    const result = env("NON_EXISTENT_VAR", true);
    assertEquals(result, true);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: env throws on invalid number conversion", () => {
  try {
    setTestEnv({ TEST_VAR: "not_a_number" });

    assertThrows(
      () => env("TEST_VAR", 0),
      Error,
      "Environment variable TEST_VAR must be a valid number, got: not_a_number",
    );
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: env throws on invalid boolean conversion", () => {
  try {
    setTestEnv({ TEST_VAR: "maybe" });

    assertThrows(
      () => env("TEST_VAR", false),
      Error,
      "Environment variable TEST_VAR must be a valid boolean (true/false/1/0), got: maybe",
    );
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: env handles boolean '1' and '0' values", () => {
  try {
    setTestEnv({ TEST_VAR_TRUE: "1", TEST_VAR_FALSE: "0" });

    const resultTrue = env("TEST_VAR_TRUE", false);
    const resultFalse = env("TEST_VAR_FALSE", true);

    assertEquals(resultTrue, true);
    assertEquals(resultFalse, false);
  } finally {
    restoreEnv();
  }
});

// Tests for parseOwnerIds function
Deno.test("utils: parseOwnerIds parses single ID", () => {
  const result = parseOwnerIds("123456789");
  assertEquals(result, [123456789]);
});

Deno.test("utils: parseOwnerIds parses multiple IDs with spaces", () => {
  const result = parseOwnerIds("123, 456 , 789 ");
  assertEquals(result, [123, 456, 789]);
});

Deno.test("utils: parseOwnerIds handles empty strings in CSV", () => {
  const result = parseOwnerIds("123,,456,  ,789");
  assertEquals(result, [123, 456, 789]);
});

Deno.test("utils: parseOwnerIds filters out non-numeric values", () => {
  const result = parseOwnerIds("123,abc,456,def,789");
  assertEquals(result, [123, 456, 789]);
});

Deno.test("utils: parseOwnerIds filters out NaN values", () => {
  const result = parseOwnerIds("123,NaN,456,Infinity,789");
  assertEquals(result, [123, 456, 789]);
});

Deno.test("utils: parseOwnerIds throws on empty input", () => {
  assertThrows(
    () => parseOwnerIds(""),
    Error,
    "Environment variable  must contain at least one valid numeric ID",
  );
});

Deno.test("utils: parseOwnerIds throws on whitespace only", () => {
  assertThrows(
    () => parseOwnerIds("   ,  ,  "),
    Error,
    "Environment variable    ,  ,   must contain at least one valid numeric ID",
  );
});

Deno.test("utils: parseOwnerIds throws on non-numeric input", () => {
  assertThrows(
    () => parseOwnerIds("abc,def,ghi"),
    Error,
    "Environment variable abc,def,ghi must contain at least one valid numeric ID",
  );
});

Deno.test("utils: parseOwnerIds handles negative numbers", () => {
  const result = parseOwnerIds("-123,456,-789");
  assertEquals(result, [-123, 456, -789]);
});

Deno.test("utils: parseOwnerIds handles decimal numbers", () => {
  const result = parseOwnerIds("123.45,456.78,789.01");
  assertEquals(result, [123.45, 456.78, 789.01]);
});

// Tests for envOptional function
Deno.test("utils: envOptional returns undefined when variable is not set", () => {
  try {
    restoreEnv();

    const result = envOptional("NON_EXISTENT_VAR");
    assertEquals(result, undefined);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envOptional returns default when variable is not set", () => {
  try {
    restoreEnv();

    const result = envOptional("NON_EXISTENT_VAR", "default_value");
    assertEquals(result, "default_value");
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envOptional returns string value when variable is set", () => {
  try {
    setTestEnv({ TEST_VAR: "test_value" });

    const result = envOptional("TEST_VAR");
    assertEquals(result, "test_value");
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envOptional returns string value when variable is set with default", () => {
  try {
    setTestEnv({ TEST_VAR: "test_value" });

    const result = envOptional("TEST_VAR", "default_value");
    assertEquals(result, "test_value");
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envOptional returns number value when variable is set", () => {
  try {
    setTestEnv({ TEST_VAR: "123" });

    const result = envOptional("TEST_VAR", 0);
    assertEquals(result, 123);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envOptional returns number default when variable is not set", () => {
  try {
    restoreEnv();

    const result = envOptional("NON_EXISTENT_VAR", 42);
    assertEquals(result, 42);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envOptional returns boolean value when variable is set", () => {
  try {
    setTestEnv({ TEST_VAR: "true" });

    const result = envOptional("TEST_VAR", false);
    assertEquals(result, true);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envOptional returns boolean default when variable is not set", () => {
  try {
    restoreEnv();

    const result = envOptional("NON_EXISTENT_VAR", true);
    assertEquals(result, true);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envOptional throws on invalid number conversion", () => {
  try {
    setTestEnv({ TEST_VAR: "not_a_number" });

    assertThrows(
      () => envOptional("TEST_VAR", 0),
      Error,
      "Environment variable TEST_VAR must be a valid number, got: not_a_number",
    );
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envOptional throws on invalid boolean conversion", () => {
  try {
    setTestEnv({ TEST_VAR: "maybe" });

    assertThrows(
      () => envOptional("TEST_VAR", false),
      Error,
      "Environment variable TEST_VAR must be a valid boolean (true/false/1/0), got: maybe",
    );
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envOptional handles boolean '1' and '0' values", () => {
  try {
    setTestEnv({ TEST_VAR_TRUE: "1", TEST_VAR_FALSE: "0" });

    const resultTrue = envOptional("TEST_VAR_TRUE", false);
    const resultFalse = envOptional("TEST_VAR_FALSE", true);

    assertEquals(resultTrue, true);
    assertEquals(resultFalse, false);
  } finally {
    restoreEnv();
  }
});

// Tests for envNumberOptional function (deprecated)
Deno.test("utils: envNumberOptional returns undefined when variable is not set", () => {
  try {
    restoreEnv();

    const result = envNumberOptional("NON_EXISTENT_VAR");
    assertEquals(result, undefined);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envNumberOptional returns default when variable is not set", () => {
  try {
    restoreEnv();

    const result = envNumberOptional("NON_EXISTENT_VAR", 42);
    assertEquals(result, 42);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envNumberOptional returns number value when variable is set", () => {
  try {
    setTestEnv({ TEST_VAR: "123" });

    const result = envNumberOptional("TEST_VAR", 0);
    assertEquals(result, 123);
  } finally {
    restoreEnv();
  }
});

Deno.test("utils: envNumberOptional throws on invalid number conversion", () => {
  try {
    setTestEnv({ TEST_VAR: "not_a_number" });

    assertThrows(
      () => envNumberOptional("TEST_VAR", 0),
      Error,
      "Environment variable TEST_VAR must be a valid number, got: not_a_number",
    );
  } finally {
    restoreEnv();
  }
});

// Tests for toJSONWithoutPII function
Deno.test("utils: toJSONWithoutPII masks API key", () => {
  const config = {
    agent: {
      llm: {
        apiKey: "sk-1234567890abcdef",
        model: "gpt-4",
      },
    },
    telegram: {
      botToken: "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    },
  };

  const result = toJSONWithoutPII(config);
  const parsed = JSON.parse(result);

  assertEquals(parsed.agent.llm.apiKey, "sk-1***********cdef");
  assertEquals(parsed.agent.llm.model, "gpt-4");
});

Deno.test("utils: toJSONWithoutPII masks bot token", () => {
  const config = {
    telegram: {
      botToken: "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    },
  };

  const result = toJSONWithoutPII(config);
  const parsed = JSON.parse(result);

  assertEquals(parsed.telegram.botToken, "1234*****************************WXYZ");
});

Deno.test("utils: toJSONWithoutPII handles missing sensitive fields", () => {
  const config = {
    agent: {
      llm: {
        model: "gpt-4",
      },
    },
    telegram: {
      ownerIds: [123, 456],
    },
  };

  const result = toJSONWithoutPII(config);
  const parsed = JSON.parse(result);

  assertEquals(parsed.agent.llm.model, "gpt-4");
  assertEquals(parsed.telegram.ownerIds, [123, 456]);
});

Deno.test("utils: toJSONWithoutPII handles null config", () => {
  const result = toJSONWithoutPII(null);
  const parsed = JSON.parse(result);

  assertEquals(parsed, null);
});

Deno.test("utils: toJSONWithoutPII handles undefined config", () => {
  const result = toJSONWithoutPII(undefined);

  // JSON.stringify(undefined) returns undefined, not a string
  assertEquals(result, undefined);
});

Deno.test("utils: toJSONWithoutPII handles empty object", () => {
  const result = toJSONWithoutPII({});
  const parsed = JSON.parse(result);

  assertEquals(parsed, {});
});

Deno.test("utils: toJSONWithoutPII preserves non-sensitive data", () => {
  const config = {
    agent: {
      llm: {
        apiKey: "sk-1234567890abcdef",
        model: "gpt-4",
        temperature: 0.1,
      },
      dataDir: "./data",
    },
    telegram: {
      botToken: "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      ownerIds: [123, 456],
    },
    logging: {
      format: "json",
    },
  };

  const result = toJSONWithoutPII(config);
  const parsed = JSON.parse(result);

  // Check that sensitive data is masked
  assertEquals(parsed.agent.llm.apiKey, "sk-1***********cdef");
  assertEquals(parsed.telegram.botToken, "1234*****************************WXYZ");

  // Check that non-sensitive data is preserved
  assertEquals(parsed.agent.llm.model, "gpt-4");
  assertEquals(parsed.agent.llm.temperature, 0.1);
  assertEquals(parsed.agent.dataDir, "./data");
  assertEquals(parsed.telegram.ownerIds, [123, 456]);
  assertEquals(parsed.logging.format, "json");
});

// Tests for maskString function (private function, tested indirectly through toJSONWithoutPII)
Deno.test("utils: maskString masks short strings completely", () => {
  const config = {
    agent: {
      llm: {
        apiKey: "short",
      },
    },
  };

  const result = toJSONWithoutPII(config);
  const parsed = JSON.parse(result);

  assertEquals(parsed.agent.llm.apiKey, "*****");
});

Deno.test("utils: maskString masks medium strings", () => {
  const config = {
    agent: {
      llm: {
        apiKey: "12345678",
      },
    },
  };

  const result = toJSONWithoutPII(config);
  const parsed = JSON.parse(result);

  assertEquals(parsed.agent.llm.apiKey, "********");
});

Deno.test("utils: maskString masks long strings with first and last 4 chars", () => {
  const config = {
    agent: {
      llm: {
        apiKey: "sk-1234567890abcdefghijklmnopqrstuvwxyz",
      },
    },
  };

  const result = toJSONWithoutPII(config);
  const parsed = JSON.parse(result);

  assertEquals(parsed.agent.llm.apiKey, "sk-1*******************************wxyz");
});
