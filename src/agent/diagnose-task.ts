import { log } from "../utils/logger.ts";
import { yamlDump } from "../utils/dump.ts";
import type { LanguageModelV2, LanguageModelV2Usage } from "@ai-sdk/provider";
import { z } from "zod";
import {
  Experimental_Agent as Agent,
  hasToolCall,
  NoObjectGeneratedError,
  Output,
  stepCountIs,
  Tool,
} from "ai";
import { stopTool } from "./tools/stop.ts";
import { SystemInfo } from "../system-info/system-info.ts";
import { FactsStorage } from "../core/types.ts";
import { AuditSummary } from "./audit-task.ts";
import { sumUsages } from "../llm/cost.ts";

export interface DiagnoseTask {
  /**
   * Processes audit summary and decides on problem description.
   * Uses LLM to determine cause of the problem.
   *
   * @param input - Audit summary from audit task
   * @returns Promise resolving to diagnose summary
   */
  diagnose(input: AuditSummary): Promise<DiagnoseSummary>;
}

export type DiagnoseSummary = {
  isEscalationNeeded: boolean;
  mostLikelyHypothesis: string;
  thoughts: string[];
  usage: LanguageModelV2Usage;
};

/**
 * Creates agent instance with encapsulated dependencies.
 * Provides clean factory function for agent creation.
 *
 * @param llmModel - LLM model for text generation
 * @param terminalTool - Tool for terminal interactions
 * @returns Configured Agent instance
 */
export function createDiagnoseTask({
  llmModel,
  llmTemperature,
  terminalTool,
  systemInfo,
  factsStorage,
}: {
  llmModel: LanguageModelV2;
  llmTemperature: number;
  terminalTool: Tool;
  systemInfo: SystemInfo;
  factsStorage: FactsStorage;
}): DiagnoseTask {
  return {
    async diagnose(input: AuditSummary): Promise<DiagnoseSummary> {
      log({
        mod: "agent",
        event: "diagnose_start",
        reason: input.reason,
        evidence: input.evidence,
        analysisLength: input.rawAuditData.length,
      });

      const systemPrompt = await generateDiagnoseSystemPrompt({
        systemInfo,
        factsStorage,
        auditAnalysis: input.rawAuditData,
        reason: input.reason,
        evidence: input.evidence,
      });

      log({
        messages: yamlDump(systemPrompt),
      });

      try {
        const agent = new Agent({
          model: llmModel,
          temperature: llmTemperature,
          tools: {
            terminal: terminalTool,
            stop: stopTool(),
          },
          stopWhen: [
            hasToolCall("stop"),
            stepCountIs(30),
          ],
          experimental_output: Output.object({
            schema: z.object({
              isEscalationNeeded: z.boolean(),
              mostLikelyHypothesis: z.string(),
              thoughts: z.array(z.string()),
            }),
          }),
        });
        const { experimental_output: summary, usage } = await agent.generate({
          prompt: systemPrompt,
        });

        log({
          mod: "agent",
          event: "diagnose_success",
          isEscalationNeeded: summary.isEscalationNeeded,
          mostLikelyHypothesis: summary.mostLikelyHypothesis,
          thoughts: summary.thoughts,
        });

        return {
          isEscalationNeeded: summary.isEscalationNeeded,
          mostLikelyHypothesis: summary.mostLikelyHypothesis,
          thoughts: summary.thoughts,
          usage: sumUsages([input.usage, usage]),
        };
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) {
          log({
            mod: "agent",
            event: "diagnose_error",
            error: yamlDump(error),
          });
        }
        throw error;
      }
    },
  };
}

async function generateDiagnoseSystemPrompt(
  { systemInfo, factsStorage, auditAnalysis, reason, evidence }: {
    systemInfo: SystemInfo;
    factsStorage: FactsStorage;
    auditAnalysis: string;
    reason: string;
    evidence: { metric: string; value: string }[];
  },
) {
  return `BED-LLM Terminal Diagnostician

# ROLE
You are a home server agent named Severin. You must determine the **most likely root cause** using **read-only terminal diagnostics** (minimize calls; 1-5 preferred) and then output a object with short human-readable most likely hypothesis (2–5 sentences). If the problem is not found, return isEscalationNeeded=false. Also, output an array of thoughts about the problem that appeared during your diagnosis.

Inputs:
* **TELEMETRY_SNAPSHOT**: the original telemetry snapshot
* **ESCALATION_PAYLOAD**: an escalation payload from the Auditor (\`reason\`, \`evidence\`).
* **SERVER_INFO** — structured information about OS/distribution, resources, versions, node roles, etc. (source of truth).
* **FACTS** — stored facts (accepted decisions, policies, paths, environment variables, contacts, etc.). Can be updated via \`add_fact\`, \`update_fact\`, \`delete_fact\` tools.

## TOOLS
- **terminal** - execute shell commands:
  * request: { "command": "<shell>", "cwd": "<optional>", "reason": "<why this command is needed>" }
  * response: { "exitCode": <number>, "stdout": "<string>", "stderr": "<string>", "truncated": <boolean>, "durationMs": <number> }
- **add_fact** - add a new fact.
- **update_fact** - update an existing fact.
- **delete_fact** - delete a fact.

## METHOD (BED-LLM)
- Maintain 3–10 hypotheses H with short rationales and testable predictions.
- Choose commands that **maximally reduce uncertainty** (binary/small-choice outcomes).
- Align each question to a command batch; map outcomes → hypothesis updates.
- Use safe, bounded, portable commands; print section headers; add timeouts; avoid secrets.

## STARTER BATCHES (pick minimally sufficient set)
A) Systemd/kernel:
  command:
    printf '\n##### FAILED #####\n'; systemctl --failed --no-legend || true;
    printf '\n##### RUNNING #####\n'; systemctl is-system-running || true;
    printf '\n##### ERRORS (2h) #####\n'; journalctl -p err -S -2h --no-pager | tail -n 120 || true;
    printf '\n##### KERNEL #####\n'; dmesg -T | egrep -i "error|fail|BUG|oops|throttl|thermal" | tail -n 120 || true
  reason: confirm degraded/failed units vs. kernel/thermal issues
B) Disk/inodes:
  command:
    printf '\n##### DF -hT #####\n'; df -hT | sed 's/  */ /g';
    printf '\n##### DF -i #####\n'; df -i | sed 's/  */ /g';
    printf '\n##### TOP SPACE / (d1) #####\n'; du -x -h -d1 / 2>/dev/null | sort -h | tail -n 10
  reason: verify low free% and locate largest consumers
C) Memory/swap:
  command:
    printf '\n##### FREE -m #####\n'; free -m || true;
    printf '\n##### VMSTAT (5s) #####\n'; vmstat 1 5 || true;
    printf '\n##### TOP MEM #####\n'; ps -eo pid,ppid,comm,%mem,rss --sort=-%mem | head -n 15
  reason: confirm RAM/swap pressure and top offenders
D) CPU/IO:
  command:
    printf '\n##### TOP CPU #####\n'; ps -eo pid,ppid,comm,%cpu --sort=-%cpu | head -n 15;
    printf '\n##### VMSTAT (5s) #####\n'; vmstat 1 5;
    printf '\n##### IOSTAT #####\n'; iostat -xz 1 3 2>/dev/null || true
  reason: separate CPU saturation from IO wait and identify sources
E) Network:
  command:
    printf '\n##### LINKS (errors) #####\n'; ip -s link || ifconfig -a || true;
    printf '\n##### SOCKET SUMMARY #####\n'; ss -s 2>/dev/null || netstat -s 2>/dev/null || true;
    printf '\n##### PING #####\n'; timeout 6s ping -c 5 8.8.8.8 || true; timeout 6s ping -c 5 1.1.1.1 || true
  reason: distinguish link errors vs. upstream reachability
F) Time sync:
  command:
    printf '\n##### TIME & SYNC #####\n'; date -u; timedatectl 2>/dev/null || true; chronyc tracking 2>/dev/null || ntpq -p 2>/dev/null || true
  reason: confirm NTP state and drift

## OUTPUT
- After 1–5 terminal calls, produce a short diagnosis (2–5 sentences) that:
  + names the most likely root cause,
  + cites decisive lines/metrics from telemetry and command outputs,
  + (optional) suggests the minimal safe next action.
- Avoid destructive commands; if a fix is proposed, provide pre-/post-verification steps.

## ROUTING CONTRACT
Input fields:
  - telemetrySnapshot: string
  - escalation reason: string;
  - problem evidence: { metric: string; value: string }[];
Output fields:
  - isEscalationNeeded: boolean - true if the problem is found, false otherwise;
  - mostLikelyHypothesis: string - most likely hypothesis;
  - thoughts: string[] - thoughts about the problem;

You may update and reorder hypotheses as new evidence arrives and stop when one exceeds ~95% plausibility.

## SERVER_INFO
${systemInfo.toMarkdown()}

## FACTS
${await factsStorage.toMarkdown()}

## TELEMETRY_SNAPSHOT
${auditAnalysis}

## ESCALATION_PAYLOAD
- Reason: ${reason}
- Evidence:
${evidence.map((item) => `  * ${item.metric}: ${item.value}`).join("\n")}
`;
}
