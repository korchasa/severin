/**
 * Health checks scheduler with singleflight pattern
 */

import type { Bot, Context } from "grammy";
import type { Config } from "../config/types.ts";
// MainAgent import removed as it's not used directly
import { runAllChecksForMetrics } from "../checks/all-checks.ts";
import { MetricsService } from "../checks/metrics-service.ts";
import { MetricsAnalyzer } from "../checks/metrics-analyzer.ts";
import { log, logOutgoingMessageNoContext } from "../utils/logger.ts";
import { markdownToTelegramMarkdownV2 } from "../telegram/telegram-format.ts";
import { AuditTask } from "../agent/audit-task.ts";
import { ConversationHistory } from "../agent/history/service.ts";
import { DiagnoseTask } from "../agent/diagnose-task.ts";
import { yamlDump } from "../utils/dump.ts";

/**
 * Scheduler state for singleflight pattern
 */
interface SchedulerState {
  running: Promise<void> | null;
  bot: Bot<Context> | null;
  config: Config | null;
  history: ConversationHistory | null;
  auditTask: AuditTask | null;
  diagnoseTask: DiagnoseTask | null;
  metricsService: MetricsService | null;
  metricsAnalyzer: MetricsAnalyzer | null;
}

class HealthScheduler {
  private state: SchedulerState = {
    running: null,
    bot: null,
    config: null,
    history: null,
    auditTask: null,
    diagnoseTask: null,
    metricsService: null,
    metricsAnalyzer: null,
  };

  /**
   * Initializes the scheduler with bot instance, config and agent
   */
  initialize(
    bot: Bot<Context>,
    config: Config,
    history: ConversationHistory,
    auditTask: AuditTask,
    diagnoseTask: DiagnoseTask,
  ): void {
    this.state.bot = bot;
    this.state.config = config;
    this.state.history = history;
    this.state.auditTask = auditTask;
    this.state.diagnoseTask = diagnoseTask;

    // Initialize metrics services
    const metricsFile = `${config.agent.dataDir}/metrics.jsonl`;
    this.state.metricsService = new MetricsService(metricsFile);
    this.state.metricsAnalyzer = new MetricsAnalyzer();
  }

  /**
   * Runs health checks and potentially sends notifications using intelligent analysis
   */
  private async runChecksAndMaybeNotify(): Promise<void> {
    if (
      !this.state.config || !this.state.history || !this.state.auditTask ||
      !this.state.diagnoseTask || !this.state.metricsService || !this.state.metricsAnalyzer
    ) {
      throw new Error("Scheduler not initialized with config, agent and services");
    }

    const now = Date.now();

    // 1. Collect current metrics
    const currentMetrics = await runAllChecksForMetrics(this.state.config);

    // 2. Store metrics for historical analysis
    await this.state.metricsService.storeMetrics(currentMetrics);

    // 3. Analyze metrics against history
    const analysis = await this.state.metricsAnalyzer.analyzeMetrics(
      currentMetrics,
      async (name: string, time: Date, tolerance: number) =>
        await this.state.metricsService!.findMetricsAtTime(name, time, tolerance),
      {
        changeThreshold: this.state.config.metrics.changeThreshold,
        comparisonMinutes: this.state.config.metrics.comparisonMinutes,
      },
    );

    // 4. Use agent to decide if notification is needed
    const auditSummary = await this.state.auditTask.auditMetrics({
      rawAuditData: analysis.analysisContext,
      correlationId: `scheduler-${now}`,
    });

    if (!auditSummary.isEscalationNeeded) {
      log({
        mod: "checks",
        event: "audit_summary",
        data: yamlDump(auditSummary),
      });
    }

    // 5. Use diagnostician to diagnose the problem
    const diagnoseSummary = await this.state.diagnoseTask.diagnose({
      auditAnalysis: auditSummary.rawAuditData,
      reason: auditSummary.reason,
      evidence: auditSummary.evidence,
    });

    // 6. Send notification only if Diagnostician says there's a problem
    if (diagnoseSummary.isEscalationNeeded && this.state.bot) {
      const chatId = this.state.config.telegram.ownerIds[0];
      logOutgoingMessageNoContext("sendMessage", chatId, diagnoseSummary.mostLikelyHypothesis);
      try {
        const safeText = markdownToTelegramMarkdownV2("🚨 " + diagnoseSummary.mostLikelyHypothesis);
        await this.state.bot.api.sendMessage(chatId, safeText, { parse_mode: "MarkdownV2" });
        this.state.history.appendMessage("assistant", diagnoseSummary.mostLikelyHypothesis);
        log({
          mod: "checks",
          event: "notification_sent",
          significant_changes: analysis.significantChanges.length,
        });
      } catch (err) {
        log({
          mod: "checks",
          event: "notify_error",
          message: (err as Error).message,
        });
      }
    }

    // 6. Cleanup old metrics
    const cutoffTime = new Date(
      Date.now() - this.state.config.metrics.historyHours * 60 * 60 * 1000,
    );
    await this.state.metricsService.cleanupOldMetrics(cutoffTime);

    log({
      mod: "checks",
      event: "done",
      duration_ms: Date.now() - now,
      metrics_collected: currentMetrics.length,
      significant_changes: analysis.significantChanges.length,
      llm_decision: diagnoseSummary.isEscalationNeeded ? "escalation_needed" : "false_alarm",
    });
  }

  /**
   * Triggers health check execution with singleflight protection
   */
  triggerChecks(): void {
    // If checks are already running, skip launch
    if (this.state.running) return; // singleflight

    this.state.running = this.runChecksAndMaybeNotify().finally(() => {
      this.state.running = null;
      // After completion schedule next run
      this.scheduleNext();
    });
  }

  /**
   * Schedules the next health check run
   */
  private scheduleNext(): void {
    if (!this.state.config) {
      throw new Error("Scheduler not initialized with config");
    }

    const intervalMs = this.state.config.scheduler.intervalHours * 60 * 60 * 1000;
    const jitterMs =
      (Math.floor(Math.random() * (this.state.config.scheduler.jitterMinutes * 2 + 1)) -
        this.state.config.scheduler.jitterMinutes) * 60 * 1000;
    setTimeout(() => this.triggerChecks(), intervalMs + jitterMs);
  }

  /**
   * Checks if health checks are currently running
   */
  isRunning(): boolean {
    return this.state.running !== null;
  }
}

// Global scheduler instance
export const healthScheduler = new HealthScheduler();
