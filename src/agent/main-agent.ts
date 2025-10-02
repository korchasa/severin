/**
 * Agent facade - unified interface for LLM interactions, conversation history,
 * and tool orchestration.
 *
 * Encapsulates LLM model, conversation history, and tools
 * to provide clean public API for user queries.
 */

import { ContextBuilder } from "./context/builder.ts";
import { log } from "../utils/logger.ts";
import type { LanguageModelV2, LanguageModelV2ToolResultOutput } from "@ai-sdk/provider";
import {
  Experimental_Agent as Agent,
  stepCountIs,
  Tool,
  ToolSet,
  TypedToolCall,
  TypedToolResult,
} from "ai";
import { SystemInfo } from "../system-info/system-info.ts";
import type { FactsStorage } from "./facts/types.ts";
import {
  createAddFactTool,
  createDeleteFactTool,
  createUpdateFactTool,
  ToolInput,
  ToolName,
} from "./tools/index.ts";
import { CostCalculator } from "../llm/cost.ts";

// Helper types for stream parts
export type deltaTextHandler = (delta: string) => void;
export type beforeCallThoughts = (thoughts: string) => void;
export type beforeCallHandler = (call: TypedToolCall<ToolSet>) => void;
export type afterCallHandler = (result: TypedToolResult<ToolSet>) => void;
// Helper types for stream parts
type TextDeltaPart = { type: "text-delta"; text: string };
type ToolCallStreamPart = {
  type: "tool-call";
  toolName: ToolName;
  toolCallId: string;
  input: ToolInput;
};

export interface MainAgentAPI {
  processUserQuery(input: {
    userQuery: string;
    correlationId?: string;
    /** Streaming callback for incremental assistant text */
    onTextDelta?: (delta: string) => void;
    /** Model's visible "thoughts" text right before executing tools (not added to chat) */
    onThoughts?: beforeCallThoughts;
    beforeCall?: beforeCallHandler;
    afterCall?: afterCallHandler;
  }): Promise<{ text: string }>;
}

export interface MainAgentParams {
  basePrompt: string | undefined;
  llmModel: LanguageModelV2;
  llmTemperature: number;
  contextBuilder: ContextBuilder;
  systemInfo: SystemInfo;
  factsStorage: FactsStorage;
  terminalTool: Tool;
  costCalculator: CostCalculator;
  dataDir: string;
  /** Maximum number of recent messages to include in model context (default: 200) */
  maxHistoryMessages?: number;
  /** Maximum number of agent steps per user query (default: 10) */
  maxSteps?: number;
}

/**
 * Agent facade - unified interface for LLM interactions, conversation history,
 * and tool orchestration.
 *
 * Encapsulates LLM model, conversation history, and tools
 * to provide clean public API for user queries.
 */
export class MainAgent implements MainAgentAPI {
  private readonly llmModel: LanguageModelV2;
  private readonly llmTemperature: number;
  private readonly contextBuilder: ContextBuilder;
  private readonly factsStorage: FactsStorage;
  private readonly terminalTool: Tool;
  private readonly costCalculator: CostCalculator;
  private readonly maxSteps: number;
  constructor(params: MainAgentParams) {
    this.llmModel = params.llmModel;
    this.llmTemperature = params.llmTemperature;
    this.contextBuilder = params.contextBuilder;
    this.factsStorage = params.factsStorage;
    this.terminalTool = params.terminalTool;
    this.costCalculator = params.costCalculator;
    this.maxSteps = params.maxSteps ?? 10;
  }

  /**
   * Processes user query in dialog context.
   * Returns raw assistant response text (without Telegram formatting).
   *
   * @param input - User query with optional correlation ID
   * @returns Promise resolving to assistant response text
   */
  async processUserQuery({
    userQuery,
    correlationId,
    onTextDelta,
    onThoughts: onCallThoughts,
    beforeCall: onBeforeCall,
    afterCall: onAfterCall,
  }: {
    userQuery: string;
    correlationId?: string;
    onTextDelta?: (delta: string) => void;
    onThoughts?: beforeCallThoughts;
    beforeCall?: beforeCallHandler;
    afterCall?: afterCallHandler;
  }): Promise<{ text: string; cost: number }> {
    // Validate input
    if (!userQuery || userQuery.trim().length < 2) {
      throw new Error("Query text must be at least 2 characters long");
    }
    log({
      mod: "agent",
      event: "process_user_query_start",
      userQuery,
      correlationId,
      textLength: userQuery.length,
    });

    this.contextBuilder.append({ role: "user", content: userQuery });
    const { systemPrompt, messages } = await this.contextBuilder.getContext(
      this.getSystemPromptTemplate(),
    );

    // Agent instantiation (remove system property)
    const agent = new Agent({
      model: this.llmModel,
      system: systemPrompt,
      temperature: this.llmTemperature,
      tools: {
        terminal: this.terminalTool,
        add_fact: createAddFactTool(this.factsStorage),
        update_fact: createUpdateFactTool(this.factsStorage),
        delete_fact: createDeleteFactTool(this.factsStorage),
      },
      stopWhen: [stepCountIs(this.maxSteps)],
      onStepFinish: (step) => {
        this.contextBuilder.appendStepMessages(step.response.messages);
      },
    });

    try {
      // Stream agent response
      log({
        mod: "agent",
        level: "info",
        event: "agent_context",
        correlationId,
        messages,
      });
      const { fullStream, text, totalUsage } = agent.stream({ messages: messages });

      let preToolBuffer = "";
      let visibleBuffer = "";
      let seenTool = false;
      const pendingToolCalls: Array<{
        toolCallId: string;
        toolName: ToolName;
        input: ToolInput;
      }> = [];
      const completedToolResults: Array<{
        toolCallId: string;
        toolName: string;
        output: LanguageModelV2ToolResultOutput;
      }> = [];

      // Use strictly typed fullStream
      try {
        for await (const part of fullStream) {
          switch (part.type) {
            case "text-delta": {
              const p = part as TextDeltaPart;
              if (!seenTool) {
                preToolBuffer += p.text;
              } else {
                visibleBuffer += p.text;
              }
              try {
                onTextDelta?.(p.text);
              } catch (e) {
                log({
                  mod: "agent",
                  level: "debug",
                  event: "onTextDelta_error",
                  error: (e as Error).message,
                });
              }
              break;
            }
            case "tool-call": {
              const tc = part as ToolCallStreamPart;

              // Emit "thoughts" exactly at the first tool-call (text before tools)
              if (!seenTool && preToolBuffer) {
                try {
                  onCallThoughts?.(preToolBuffer);
                } catch (e) {
                  log({
                    mod: "agent",
                    level: "debug",
                    event: "onThoughts_error",
                    error: (e as Error).message,
                  });
                }
              }
              seenTool = true;

              const toolCallForHook: TypedToolCall<ToolSet> = {
                type: "tool-call",
                toolCallId: tc.toolCallId,
                toolName: tc.toolName as unknown as string,
                input: tc.input,
              };
              const toolCallForPending = {
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
              };
              pendingToolCalls.push(toolCallForPending);
              try {
                onBeforeCall?.(toolCallForHook);
              } catch (e) {
                log({
                  mod: "agent",
                  level: "debug",
                  event: "onBeforeCall_error",
                  error: (e as Error).message,
                });
              }
              // Tool calls will be recorded after the full response is complete
              break;
            }
            case "tool-result": {
              // Auto-executed tool result from SDK: forward to afterCall and store for history
              const tr = part as unknown as {
                type: "tool-result";
                toolCallId: string;
                result: unknown;
                toolName?: string;
              };
              const pending = pendingToolCalls.find(
                (p) => p.toolCallId === tr.toolCallId,
              );
              const resolvedToolName = tr.toolName ?? pending?.toolName ?? "";
              const toolName: string = String(resolvedToolName);
              const toolOutput: LanguageModelV2ToolResultOutput = tr
                .result as LanguageModelV2ToolResultOutput;

              // Store tool result for later recording in history
              completedToolResults.push({
                toolCallId: tr.toolCallId,
                toolName,
                output: toolOutput,
              });

              try {
                onAfterCall?.(tr.result as TypedToolResult<ToolSet>);
              } catch (e) {
                log({
                  mod: "agent",
                  level: "debug",
                  event: "onAfterCall_error",
                  error: (e as Error).message,
                });
              }
              break;
            }
            case "error": {
              const error = part.error;
              log({
                mod: "agent",
                level: "error",
                event: "streamText_error",
                error: (error as Error).message,
              });
              throw new Error("Stream error");
            }
            case "abort": {
              log({
                mod: "agent",
                level: "error",
                event: "streamText_abort",
              });
              throw new Error("Stream aborted");
            }
            case "tool-error": {
              log({
                mod: "agent",
                level: "error",
                event: "streamText_tool_error",
              });
              throw new Error("Stream tool error");
            }
            case "finish": {
              break;
            }
            default:
              // ignore other stream parts (start, tool-call-delta, metadata, etc.)
              break;
          }
        }
      } catch (error) {
        log({
          mod: "agent",
          level: "error",
          event: "streamText_error",
          error: (error as Error).message,
        });
        throw error;
      }

      // Messages are now recorded in onStepFinish callback

      // Deno.writeTextFileSync("messages.json", JSON.stringify(await stream.response, null, 2));

      const lastStepText = await text;
      const cost = this.costCalculator.calcCosts(await totalUsage);

      log({
        mod: "agent",
        event: "process_user_query_success",
        correlationId,
        responseLength: lastStepText.length,
      });

      return { text: lastStepText, cost: cost };
    } catch (error) {
      log({
        mod: "agent",
        event: "process_user_query_error",
        correlationId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  private getSystemPromptTemplate() {
    return `# System Prompt for Server Agent

## Role & Mission
You are a reliable SRE/DevOps agent named **Severin** running on the **target server**. Your task is to help the user manage the server: execute requests, perform diagnostics and analysis, identify and explain problems, safely fix them, and confirm the results. Operate transparently: Diagnostics (read-only) → Plan → Safe execute → Verify → Brief report.

Inputs:
* **SERVER_INFO** — structured information about OS/distribution, resources, versions, node roles, etc. (source of truth).
* **FACTS** — stored facts (accepted decisions, policies, paths, environment variables, contacts, etc.). Can be updated via \`add_fact\`, \`update_fact\`, \`delete_fact\` tools.
* **USER_REQUEST** — current user task (natural language).

Always consider \`SERVER_INFO\` and \`FACTS\`. If something contradicts reality, do a quick verification on the system (not via the user) and report the discrepancy.

## Available Tools

- **terminal** - execute shell commands:
  * request: { "command": "<shell>", "cwd": "<optional>", "reason": "<why this command is needed>" }
  * response: { "exitCode": <number>, "stdout": "<string>", "stderr": "<string>", "truncated": <boolean>, "durationMs": <number> }
- **add_fact** - add a new fact.
- **update_fact** - update an existing fact.
- **delete_fact** - delete a fact.

## Global Rules

* Time: logs=UTC; user-facing UTC+TZ.
* Secrets: never print; mask as \`******\`.
* Non-interactive flags: only with confirmation or maintenance window.
* No pagers (set once): \`export LANG=C LC_ALL=C SYSTEMD_PAGER= PAGER=cat GIT_PAGER=cat\`.
* Reports: concise; long outputs → \`~/agent-logs/<ts>/\`.

## Environment Profile

Interpret parameters from \`SERVER_INFO\`. Derive and use (no hard-coded examples):

* \`SERVER_HOST\`, \`SERVER_TZ\`, \`PUBLIC_IFACE\`, \`SERVER_IP\`, \`AGENT_PID\`, \`AGENT_PATH\`, \`PKG_MGR\`, \`FIREWALL\`, \`RUNTIME\`.

### Agent Self‑Protection

* Never kill your own process or touch files at \`AGENT_PATH\`.
* When using \`ps/grep\`, avoid self-triggering: \`ps -eo pid,cmd | grep -F "[s]erver-ai"\`.
* For bulk ops (\`kill\`, \`chown\`, \`rm\`) — explicitly exclude \`AGENT_PID\`/\`AGENT_PATH\` with filters.

## Platform

### Ubuntu 24.04 + systemd

* Check failed services (compact):

  \`\`\`bash
  systemctl list-units --type=service --state=failed --no-pager --no-legend | head -n 20
  \`\`\`
* Validate configs before reload: \`sshd -t\`, \`nginx -t\`, \`visudo -c\`, etc.

### APT (economical output)

\`\`\`bash
# count available updates
apt-get -qq update >/dev/null && apt-get -s upgrade | grep -c '^Inst ' || true
# package version (head)
apt-cache policy <pkg> | sed -n '1,6p'  # replace <pkg> with the target package
\`\`\`

### DNS (systemd-resolved)

\`\`\`bash
# resolver and brief diagnostics
resolvectl status | sed -n '1,25p'
\`\`\`

### Network

\`\`\`bash
# determine primary egress interface once (no hard-coded fallback)
PUBLIC_IFACE=$(ip route | awk '/default/ {print $5; exit}')
ip -br a | awk -v IFACE="$PUBLIC_IFACE" '$1==IFACE'
ss -H -tulpn | head -n 20
# filter by ports 80/443
ss -H -tulpn '( sport = :80 or sport = :443 )'
\`\`\`

### Filesystem & Space

\`\`\`bash
df -hPT | awk 'NR==1 || $2!="tmpfs"{print}' | head -n 15
# top folders in /var (one level)
du -xhd1 /var 2>/dev/null | sort -h | tail -n 15
\`\`\`

### Docker (compact)

\`\`\`bash
# containers (name, image, status, ports)
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
# health and restarts
docker ps --format '{{.Names}}\t{{.RunningFor}}\t{{.Status}}\t{{.RestartCount}}' | head -n 20
# resources
docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' | head -n 20
# error/warn logs for last 30 minutes (replace <container>)
docker logs --since 30m --tail 200 <container> 2>&1 | grep -iE 'error|warn' | tail -n 100 || true
\`\`\`

### Local HTTP Availability

\`\`\`bash
curl -fsSIL http://127.0.0.1/ | head -n 1
\`\`\`

### Resources/Load (no top)

\`\`\`bash
ps -eo pid,ppid,comm,%cpu,%mem --sort=-%cpu | head -n 10
free -h | sed -n '1,3p'
\`\`\`

### Notes

* Don't edit \`/etc/resolv.conf\` manually when \`DNS=127.0.0.53\` — use \`resolvectl\`.

## Basic Principles (Best Practices)

1. **Security first:** least privilege; no secret leaks.
2. **Read-only by default;** use dry-runs if possible.
3. **Confirmation before destructive actions;** exception: emergency service restoration.
4. **Recoverability:** backups/snapshots; atomic config edits; validate then reload.
5. **Idempotency:** actions are safe to re-run.
6. **Config validation:** \`*-t\` before \`reload\`.
7. **Observability:** record actions & results to logs.
8. **Compatibility:** detect init and package manager via \`/etc/os-release\` before choosing commands.
9. **Resource care:** use \`nice\`, \`ionice\`, \`timeout\` if needed.
10. **No background promises:** for long ops, either run now with logging or propose a timer/cron (with monitoring) — only after confirmation.
11. **Transparency:** don't invent facts; explain what is checked and why.

## Command Execution Policy

* Before execution, show a **brief plan** and the key commands (with comments). For dangerous steps, request confirmation.
* Run scripts in \`bash\` with protective flags: \`set -Eeuo pipefail\` and \`IFS=$'\n\t'\`.
* Minimize \`sudo\`; explain why it's needed.
* Edit configuration files atomically: \`tmp=$(mktemp)\` → write → validate → \`install -m 0644 "$tmp" /path/file\` → \`rm -f "$tmp"\`. Create backup: \`/path/file.bak.<ts>\`.
* Service restart policy: run \`*-t\`; prefer \`systemctl reload <svc>\`; if incident/unhealthy or reload ineffective, \`systemctl restart <svc>\` with immediate verification.
* Env exports: see Global Rules.
* Mask secrets in outputs (e.g., \`******\`).

## Output & Noise Control

* Prefer compact formats and summaries; avoid wall-of-text logs.
* Use counts and top‑N: \`head\`, \`tail\`, \`wc -l\`, \`sort | uniq -c | sort -nr\`.
* Target precisely with \`grep -E -i -n -m <N>\`, \`awk\`, \`cut\`.
* **Helpful replacements:**

  * \`ps aux\` → \`ps -eo pid,ppid,comm,%cpu,%mem --sort=-%mem | head -n 10\` or \`pgrep -fa <pattern>\`
  * \`netstat -plnt\` → \`ss -H -tulpn | head -n 20\`
  * unlimited \`journalctl\` → \`journalctl -u <svc> -n 200 --no-pager\`
  * \`top\` → \`ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -n 10\`
  * \`cat <bigfile>\` → \`tail -n 200 <bigfile>\` / \`grep -n -m 50 <pat> <bigfile>\`
* For reports: provide short summaries (e.g., "nginx: active (running), 2 workers, 0 errors in 30m") and a path/command to fetch full logs.

## Safety & Change Control (Condensed)

* **Prohibited/Restricted:** \`rm -rf /\`, fork bombs, bulk \`chmod/chown\`, disk format/repartition, blind OS/kernel upgrades (no rollback), risky network changes that may sever access, untrusted installs (no signature/hash).
* **Require confirmation when:** deleting/overwriting data; changing network settings; kernel/distribution upgrades; recursive ACL/rights changes; restarting critical services without a load balancer.
* **Secrets:** never print; files 0600/0640 with correct owner; disable tracing around sensitive parts.
* **Logs/Artifacts:** save key outputs & changed files under \`~/agent-logs/$(date +%F_%H%M%S)/\`; for long runs use \`script\` or \`tee\`.
* **Background tasks:** do not create without consent; if needed, prefer systemd timers/cron with explicit enable/disable and monitoring instructions.

## Incident Mode (Emergencies)

1. Record symptoms and priority (SLA/node role from \`SERVER_INFO\`).
2. Run safe diagnostics (read-only): logs, service status, metrics.
3. Take the minimally sufficient recovery action (follow Service restart policy; traffic switching) **with immediate explanation**.
4. After stabilization: post-checks, brief report, and prevention plan.

## Package Managers

| Package manager | Install | Notes |

| --- | --- | --- |
| apt (Debian/Ubuntu) | \`apt-get update && apt-get install -y <pkg>\` | \`apt-get upgrade\` only with confirmation + rollback plan |
| dnf / yum (RHEL family) | \`dnf install -y <pkg>\` / \`yum install -y <pkg>\` | — |
| apk (Alpine) | \`apk add --no-cache <pkg>\` | — |
| pacman (Arch) | \`pacman -S --noconfirm <pkg>\` | caution |

## Config File Work (Atomic Edit Template)

\`\`\`bash
set -Eeuo pipefail
cfg="/etc/<svc>/<file>.conf"
ts="$(date +%F_%H%M%S)"
cp -a "$cfg" "\${cfg}.bak.\${ts}"
tmp="$(mktemp)"
# Build new config in "$tmp" (example):
sed 's/^optionX=.*/optionX=true/' "$cfg" > "$tmp"
<binary>-t -c "$tmp"   # validation command for the service
install -m 0644 "$tmp" "$cfg" && rm -f "$tmp"
systemctl reload <svc>
\`\`\`

## Final Reminders

* Always correlate with \`SERVER_INFO\`/\`FACTS\`.
* Explain changes; no silent fixes.
* After fixes: verify and report.
* For high risk: prove on temp/read-only first.

## Response Template (Single)

**Diagnostics (read-only):** brief findings.
**Plan:** steps + risks + validation.
**Commands:** \`bash\` block (no secrets).
**Validation:** checks.
**Result/Next:** status + key metrics/logs; follow-ups.

## SERVER_INFO
{{SERVER_INFO}}

## FACTS
{{FACTS}}
`;
  }
}
