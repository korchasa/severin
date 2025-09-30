/**
 * Agent facade - unified interface for LLM interactions, conversation history,
 * and tool orchestration.
 *
 * Encapsulates LLM model, conversation history, and tools
 * to provide clean public API for user queries.
 */

import { ConversationHistory } from "./history/service.ts";
import { log } from "../utils/logger.ts";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import {
  FinishReason,
  stepCountIs,
  streamText,
  TextPart,
  ToolCallPart as AIToolCallPart,
  ToolResultPart,
  ToolSet,
  TypedToolCall,
} from "ai";
import { SystemInfo } from "../system-info/system-info.ts";
import type { FactsStorage } from "../core/types.ts";
import {
  afterToolCallHandler,
  beforeToolCallHandler,
  beforeToolCallsThoughts,
  MainAgentExecutor,
  ToolInput,
  ToolName,
} from "./main-agent-executor.ts";

// Helper types for stream parts
type TextDeltaPart = { type: "text-delta"; text: string };
type ToolCallStreamPart = {
  type: "tool-call";
  toolName: ToolName;
  toolCallId: string;
  input: ToolInput;
};
type FinishPart = { type: "finish"; finishReason: FinishReason };

export interface MainAgent {
  processUserQuery(input: {
    userQuery: string;
    correlationId?: string;
    /** Streaming callback for incremental assistant text */
    onTextDelta?: (delta: string) => void;
    beforeCall?: beforeToolCallHandler;
    afterCall?: afterToolCallHandler;
  }): Promise<{ text: string }>;
}

export interface MainAgentParams {
  llmModel: LanguageModelV2;
  llmTemperature: number;
  executor: MainAgentExecutor;
  conversationHistory: ConversationHistory;
  systemInfo: SystemInfo;
  factsStorage: FactsStorage;
  dataDir: string;
  basePrompt?: string;
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
export class MainAgent implements MainAgent {
  private readonly params: MainAgentParams;
  private readonly executor: MainAgentExecutor;
  private readonly maxSteps: number;

  constructor(params: MainAgentParams) {
    this.params = params;
    this.executor = params.executor;
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
    onThoughts,
    beforeCall,
    afterCall,
  }: {
    userQuery: string;
    correlationId?: string;
    onTextDelta?: (delta: string) => void;
    onThoughts?: beforeToolCallsThoughts;
    beforeCall?: beforeToolCallHandler;
    afterCall?: afterToolCallHandler;
  }): Promise<{ text: string }> {
    // Validate input
    if (!userQuery || userQuery.trim().length < 2) {
      throw new Error("Query text must be at least 2 characters long");
    }

    log({
      mod: "agent",
      event: "process_user_query_start",
      correlationId,
      textLength: userQuery.length,
    });

    try {
      const { responseText, finishReason, stepsCount } = await this.loop(
        userQuery,
        onThoughts,
        beforeCall,
        afterCall,
        onTextDelta,
      );

      console.log(">>> loop", {
        finishReason,
        stepsCount,
        responseText,
      });

      log({
        mod: "agent",
        event: "process_user_query_success",
        correlationId,
        responseLength: responseText.length,
      });

      return { text: responseText };
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

  private async loop(
    userQuery: string,
    onThoughts?: beforeToolCallsThoughts,
    beforeCall?: beforeToolCallHandler,
    afterCall?: afterToolCallHandler,
    onTextDelta?: (delta: string) => void,
  ): Promise<{
    responseText: string;
    finishReason: FinishReason;
    stepsCount: number;
  }> {
    this.params.conversationHistory.append({ role: "user", content: userQuery });

    let text = "";
    let stepsCount = 0;
    let finishReason: FinishReason = "unknown";
    while (stepsCount < this.maxSteps) {
      const res = await this.stepStream(onThoughts, beforeCall, afterCall, onTextDelta);
      if (!res) {
        throw new Error("No result from step");
      }
      // accumulate visible assistant text across steps, adding a newline between steps
      text += (text && res.text ? "\n" : "") + res.text;
      finishReason = res.finishReason;
      stepsCount++;
      if (finishReason === "stop") {
        break;
      }
    }
    return {
      responseText: text,
      finishReason,
      stepsCount,
    };
  }

  /**
   *
   * @param onThoughts
   * @param beforeCall
   * @param afterCall
   * @returns
   */

  private async stepStream(
    onThoughts?: beforeToolCallsThoughts,
    beforeCall?: beforeToolCallHandler,
    afterCall?: afterToolCallHandler,
    onTextDelta?: (delta: string) => void,
  ): Promise<
    {
      text: string;
      finishReason: FinishReason;
    } | undefined
  > {
    console.log(">>> messages", this.params.conversationHistory.getRecentMessages(10000));

    // Stream a single step of the agent (tool orchestration is handled across loop iterations)
    const stream = streamText<ToolSet, unknown>({
      model: this.params.llmModel,
      temperature: this.params.llmTemperature,
      system: await this.generateSystemPrompt(),
      messages: this.params.conversationHistory.getRecentMessages(10000),
      tools: this.executor.getTools(),
      stopWhen: [stepCountIs(1)],
    });

    let text = "";
    let finishReason: FinishReason = "unknown";
    const pendingToolCalls: Array<{ toolCallId: string; toolName: ToolName; input: ToolInput }> =
      [];

    try {
      for await (const part of stream.fullStream) {
        switch (part.type) {
          case "text-delta": {
            const p = part as TextDeltaPart;
            text += p.text;
            try {
              onTextDelta?.(p.text);
            } catch (e) {
              console.debug("onTextDelta callback error", e);
            }
            break;
          }
          case "tool-call": {
            const tc = part as ToolCallStreamPart;
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
              beforeCall?.(toolCallForHook);
            } catch (e) {
              console.debug("beforeCall hook error", e);
            }
            break;
          }
          case "finish": {
            const f = part as FinishPart;
            finishReason = f.finishReason;
            break;
          }
          default:
            // ignore other stream parts (start, tool-call-delta, metadata, etc.)
            break;
        }
      }
    } catch (error) {
      console.error(">>> streamText error", error);
      throw error;
    }

    // Append assistant message with both the streamed text and the tool-call parts (if any)
    const assistantContent: Array<TextPart | AIToolCallPart> = [];
    if (text) assistantContent.push({ type: "text", text });
    for (const tc of pendingToolCalls) {
      const toolCallMsgPart: AIToolCallPart = {
        type: "tool-call",
        toolCallId: tc.toolCallId,
        toolName: tc.toolName as unknown as string,
        input: tc.input,
      };
      assistantContent.push(toolCallMsgPart);
    }
    this.params.conversationHistory.append({ role: "assistant", content: assistantContent });

    if (finishReason === "tool-calls" && pendingToolCalls.length > 0) {
      console.log(">>> finishReason: tool-calls", { finishReason, pendingToolCalls });
      // Expose the model's thoughts before executing tools
      try {
        onThoughts?.(text);
      } catch (e) {
        console.debug("onThoughts callback error", e);
      }

      const toolResultsParts: ToolResultPart[] = [];
      for (const tc of pendingToolCalls) {
        const toolOutput = await this.executor.executeTool(tc.toolName, tc.input, text);
        toolResultsParts.push({
          type: "tool-result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName as unknown as string,
          output: toolOutput,
        });
        try {
          afterCall?.(toolOutput);
        } catch (e) {
          console.debug("afterCall hook error", e);
        }
        console.log(">>> after tools call", {
          toolName: tc.toolName,
          toolInput: tc.input,
          toolOutput,
        });
      }

      // Append a single tool message containing all results for this step
      this.params.conversationHistory.append({ role: "tool", content: toolResultsParts });
    }

    switch (finishReason) {
      case "stop":
      case "tool-calls":
        return { text, finishReason };
      case "length":
        throw new Error("Model generated maximum number of tokens");
      case "content-filter":
        throw new Error("Content filter violation stopped the model");
      case "error":
        throw new Error("Model stopped because of an error");
      case "other":
        throw new Error("Model stopped for other reasons");
      case "unknown":
      default:
        throw new Error("Model has not transmitted a finish reason");
    }
  }

  private async generateSystemPrompt() {
    if (this.params.basePrompt !== undefined) {
      return this.params.basePrompt;
    }
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

## Output & Noise Control (Merged)

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
${this.params.systemInfo.toMarkdown()}

## FACTS
${await this.params.factsStorage.toMarkdown()}
`;
  }
}
