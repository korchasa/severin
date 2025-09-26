// sh.ts — drop-in wrapper around Deno.Command for POSIX shells (bash/zsh/sh).
// Supports pipes, quotes, and strict mode; no Windows support.

export type ShellName = "auto" | "bash" | "zsh" | "sh";

export type ShOptions = Omit<Deno.CommandOptions, "cmd" | "args"> & {
  shell?: ShellName; // default: "auto" → bash
  strict?: boolean; // default: true: set -e -u (+ pipefail for bash/zsh)
  pipefail?: boolean; // default: true (ignored for sh)
};

export type ShCommandOutput = Deno.CommandOutput & {
  /** Returns decoded stdout (UTF-8 by default). */
  stdoutText(decoder?: TextDecoder): string;
  /** Returns decoded stderr (UTF-8 by default). */
  stderrText(decoder?: TextDecoder): string;
};

export interface ShCommand {
  /** Same as Deno.Command.output(), but returns ShCommandOutput with helpers. */
  output(): Promise<ShCommandOutput>;
  /** Passthrough to Deno.Command.spawn(). */
  spawn(): Deno.ChildProcess;
  /** Convenience: resolves to the command status (implemented via spawn().status). */
  status(): Promise<Deno.CommandStatus>;
}

/**
 * Drop-in replacement for Deno.Command:
 *   const res = await sh("echo hi").output();
 *   console.log(res.stdoutText());
 */
export function sh(commandLine: string, options: ShOptions = {}): ShCommand {
  const {
    shell = "auto",
    strict = true,
    pipefail = true,
    ...rest
  } = options;

  const interpreter: Exclude<ShellName, "auto"> = shell === "auto" ? "bash" : shell;

  const pre: string[] = [];
  if (strict) {
    // -e: stop on error; -u: error on unset variables
    pre.push("set -eu");
    if ((interpreter === "bash" || interpreter === "zsh") && pipefail) {
      pre.push("set -o pipefail");
    }
  } else {
    if ((interpreter === "bash" || interpreter === "zsh") && pipefail) {
      pre.push("set -o pipefail");
    }
  }

  const composed = (pre.length ? pre.join("; ") + "; " : "") + commandLine;

  const cmd = new Deno.Command("/usr/bin/env", {
    args: [interpreter, "-c", composed],
    ...rest,
  });

  const withTextHelpers = (res: Deno.CommandOutput): ShCommandOutput => {
    const defaultDecoder = new TextDecoder();
    const out: ShCommandOutput = Object.assign(res, {
      stdoutText(decoder: TextDecoder = defaultDecoder): string {
        return decoder.decode(res.stdout);
      },
      stderrText(decoder: TextDecoder = defaultDecoder): string {
        return decoder.decode(res.stderr);
      },
    });
    return out;
  };

  return {
    async output(): Promise<ShCommandOutput> {
      const res = await cmd.output();
      return withTextHelpers(res);
    },
    spawn(): Deno.ChildProcess {
      return cmd.spawn();
    },
    status(): Promise<Deno.CommandStatus> {
      // Deno.Command does not have .status(); ChildProcess has a .status Promise.
      const child = cmd.spawn();
      return child.status;
    },
  };
}

/** POSIX template tag: safely single-quotes interpolations. */
export function sh$(
  strings: TemplateStringsArray,
  ...values: unknown[]
): ShCommand {
  const sq = (v: unknown) => {
    const s = String(v);
    if (s.length === 0) return "''";
    // POSIX-safe quoting: ' → '\''  (JS string literal: "'\\''")
    return "'" + s.replace(/'/g, "'\\''") + "'";
  };

  let cmdline = "";
  for (let i = 0; i < strings.length; i++) {
    cmdline += strings[i];
    if (i < values.length) cmdline += sq(values[i]);
  }
  return sh(cmdline);
}
