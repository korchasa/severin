/**
 * AuditTask for metrics analysis.
 *
 * Defines the AuditTask interface and its implementation for analyzing audit metrics
 * using a language model. Provides logic to determine if escalation is needed based
 * on audit analysis results, and summarizes key evidence and reasoning.
 */

import { generateObject } from "ai";
import { log } from "../utils/logger.ts";
import type { LanguageModelV2, LanguageModelV2Usage } from "@ai-sdk/provider";
import { z } from "zod";
import { SystemInfo } from "../system-info/system-info.ts";
import { FactsStorage } from "./facts/types.ts";

/**
 * Public interface for the Agent facade.
 * Provides unified access to LLM functionality for user conversations and audit analysis.
 */
export interface AuditTask {
  /**
   * Processes audit analysis results and decides on notification.
   * Uses LLM to determine if audit findings require user notification.
   *
   * @param input - Audit analysis text with optional correlation ID
   * @returns Promise resolving to decision and optional notification text
   */
  auditMetrics(input: {
    rawAuditData: string;
    correlationId?: string;
  }): Promise<AuditSummary>;
}

export type AuditSummary = {
  isEscalationNeeded: boolean;
  reason: string;
  evidence: { metric: string; value: string }[];
  rawAuditData: string;
  usage: LanguageModelV2Usage;
};

/**
 * Creates agent instance with encapsulated dependencies.
 * Provides clean factory function for agent creation.
 *
 * @param _config - Application configuration (unused for now)
 * @param llmClient - LLM client for text generation
 * @param _overrides - Optional dependency overrides for testing (unused for now)
 * @returns Configured Agent instance
 */
export function createAuditTask({
  llmModel,
  llmTemperature,
  systemInfo,
  factsStorage,
}: {
  llmModel: LanguageModelV2;
  llmTemperature: number;
  systemInfo: SystemInfo;
  factsStorage: FactsStorage;
}): AuditTask {
  return {
    async auditMetrics(
      input: { rawAuditData: string; correlationId?: string },
    ): Promise<AuditSummary> {
      const { rawAuditData, correlationId } = input;

      log({
        mod: "agent",
        event: "process_audit_results_start",
        correlationId,
        analysisLength: rawAuditData.length,
      });

      try {
        const prompt = await generateAuditSystemPrompt({ systemInfo, factsStorage, rawAuditData });
        log({ mod: "agent", event: "process_audit_results_message", message: prompt });
        // Generate LLM decision
        const { object, usage } = await generateObject({
          model: llmModel,
          temperature: llmTemperature,
          messages: [{ role: "system", content: prompt }],
          schema: z.object({
            isEscalationNeeded: z.boolean(),
            reason: z.string(),
            evidence: z.array(z.object({ metric: z.string(), value: z.string() })),
          }),
        });

        log({
          mod: "agent",
          event: "process_audit_results_success",
          correlationId,
          usage,
        });

        return { ...object, rawAuditData: rawAuditData, usage };
      } catch (error) {
        log({
          mod: "agent",
          event: "process_audit_results_error",
          correlationId,
          error: (error as Error).message,
        });
        throw error;
      }
    },
  };
}

async function generateAuditSystemPrompt(
  { systemInfo, factsStorage, rawAuditData }: {
    systemInfo: SystemInfo;
    factsStorage: FactsStorage;
    rawAuditData: string;
  },
) {
  return `Server Health Auditor (OK-or-NOT OK)

# ROLE
You are a home server agent named Severin. You decide, from a telemetry snapshot (metric→value with timestamps), whether the host is **OK** or **NOT OK**.
- If **OK**: you MUST return JSON object with isEscalationNeeded=false and a concise reason.
- If **NOT OK**: you MUST return a JSON object with isEscalationNeeded=true, concise reason and key evidence of the problem.

Inputs:
- **SERVER_INFO** — structured information about OS/distribution, resources, versions, node roles, etc. (source of truth).
- **FACTS** — stored facts (accepted decisions, policies, paths, environment variables, contacts, etc.). Can be updated via \`add_fact\`, \`update_fact\`, \`delete_fact\` tools.
- **TELEMETRY_SNAPSHOT**: Telemetry snapshot (flat map).

## HEALTH VERDICT (use only mandatory+desirable metrics)
### Step 1 — systemd/kernel:
  - systemd_failed_units_total>0 OR systemd_failed_services>0 → NOT OK
  - systemd_system_status ∈ {degraded, maintenance} → NOT OK
  - systemd_errors_recent_count significantly>0 and rising → NOT OK
  - kernel_errors_total_count>0 → NOT OK
### Step 2 — network:
  - network_connectivity_percent<100 → NOT OK
  - network_interfaces_with_errors>0 OR network_errors_health_level>0 → NOT OK
  - (desirable) latency: loss>1% OR avg RTT>100ms (sustained) → NOT OK
### Step 3 — capacity/stop risks:
  - disk_free_percent<10% (critical<5%) → NOT OK
  - time_sync_ntp_synchronized=false OR bad time_sync_health_level → NOT OK
  - temperature_health_level>0 OR temperature_max_celsius≥85°C → NOT OK
### Step 4 — memory/swap:
  - memory_usage_percent≥90% AND (swap_total_usage_percent≥5% OR swap_total_used_bytes≥512MB) → NOT OK
  - swap_total_usage_percent≥20% (sustained) → NOT OK
  - (desirable) cross-check memory_used_mb / memory_total_mb
### Step 5 — CPU/IO:
  - cpu_usage_total_percent≥90% (≥5 min) → NOT OK
  - cpu_usage_iowait_percent≥20% OR io_wait_cpu_percent≥20% (sustained) → NOT OK
  - (desirable) cpu_runnable_processes_avg>4 AND cpu_usage_total_percent≥85% → NOT OK
### Optional confirmations:
  - Inodes: inodes_overall_usage_percent≥80% OR inodes_high_usage_filesystems_count>0 → NOT OK
  - SMART: smart_failed_disks>0 OR bad smart_overall_health → NOT OK

## SERVER_INFO
${systemInfo.toMarkdown()}

## FACTS
${await factsStorage.toMarkdown()}

## TELEMETRY_SNAPSHOT
${rawAuditData}

## OUTPUT
{
  "isEscalationNeeded": <boolean>,
  "reason": "<one-line NOT OK reason>",
  "evidence": [{"metric": "<metric>", "value": "<value>"}, ...]
}
`;
}
