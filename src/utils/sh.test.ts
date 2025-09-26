// src/utils/sh.test.ts — tests for POSIX (bash/zsh/sh)
import { assert, assertEquals } from "@std/assert";
import { sh, sh$ } from "./sh.ts";

const td = new TextDecoder();

Deno.test("pipe works (stdoutText helper)", async () => {
  const res = await sh(`printf 'a b\\n' | cut -d' ' -f2`).output();
  assertEquals(res.code, 0);
  assertEquals(res.stdoutText().trim(), "b");
});

Deno.test("safe interpolation via sh$", async () => {
  const needle = `user's value`;
  const res = await sh$`printf '%s\n' ${needle}`.output();
  assertEquals(res.code, 0);
  assertEquals(res.stdoutText().trim(), needle);
});

Deno.test("sh$: single quote is escaped correctly", async () => {
  const s = "O'Brien";
  const res = await sh$`printf '%s\n' ${s}`.output();
  assertEquals(res.code, 0);
  assertEquals(res.stdoutText().trim(), s);
});

Deno.test("helpers decode stdout/stderr and match raw bytes", async () => {
  const res = await sh(`printf 'err' 1>&2; printf 'ok'`).output();
  assertEquals(res.success, true);

  // Helpers
  assertEquals(res.stdoutText(), "ok");
  assertEquals(res.stderrText(), "err");

  // Raw bytes still accessible and equal to helpers
  assertEquals(td.decode(res.stdout), "ok");
  assertEquals(td.decode(res.stderr), "err");

  // Methods exist
  assertEquals(typeof res.stdoutText, "function");
  assertEquals(typeof res.stderrText, "function");
});

Deno.test("pipefail: error propagates", async () => {
  const res = await sh(`false | cat`, { shell: "bash", pipefail: true }).output();
  assert(res.code !== 0);
});

Deno.test("strict -u catches unset variables", async () => {
  const res = await sh(`echo "$UNSET_VAR"`, { shell: "bash", strict: true }).output();
  assert(res.code !== 0);
});

Deno.test("status() wrapper resolves via spawn().status", async () => {
  const code = (await sh(`printf ok`).status()).code;
  assertEquals(code, 0);
});
