/**
 * Metrics storage and retrieval service
 * Stores metrics in JSONL format for historical analysis
 */

import { log } from "../utils/logger.ts";
import type { MetricValue } from "./types.ts";

/**
 * Service for storing and retrieving metrics with historical data
 */
export class MetricsService {
  private readonly filePath: string;

  /**
   * Creates metrics service with specified storage file
   * @param filePath Path to JSONL file for metrics storage
   */
  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Stores metrics to the JSONL file
   * @param metrics Array of metrics to store
   */
  async storeMetrics(metrics: MetricValue[]): Promise<void> {
    if (metrics.length === 0) return;

    const lines = metrics.map((m) => JSON.stringify(m)).join("\n") + "\n";
    await Deno.writeTextFile(this.filePath, lines, { append: true });
  }

  /**
   * Retrieves all stored metrics
   * @returns Array of all metrics in chronological order
   */
  async getAllMetrics(): Promise<MetricValue[]> {
    try {
      const content = await Deno.readTextFile(this.filePath);
      const lines = content.trim().split("\n").filter((line) => line.length > 0);
      const metrics: MetricValue[] = [];

      for (const line of lines) {
        try {
          const metric = JSON.parse(line) as MetricValue;
          metrics.push(metric);
        } catch (_parseError) {
          log({
            mod: "checks",
            level: "warn",
            message: `Skipping invalid JSON line in metrics file: ${line.substring(0, 100)}...`,
            event: "invalid_json_line",
            line: line.substring(0, 100),
          });
        }
      }

      return metrics;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Finds the most recent metric value for a given name at or near a specific time
   * @param name Metric name to search for
   * @param targetTime Target timestamp
   * @param toleranceMs Time tolerance in milliseconds
   * @returns Metric value if found within tolerance, null otherwise
   */
  async findMetricsAtTime(
    name: string,
    targetTime: Date,
    toleranceMs: number,
  ): Promise<MetricValue | null> {
    const allMetrics = await this.getAllMetrics();
    const metrics = allMetrics
      .filter((m) => m.name === name)
      .map((m) => ({ ...m, parsedTs: new Date(m.ts), original: m }))
      .sort((a, b) => b.parsedTs.getTime() - a.parsedTs.getTime()); // Most recent first

    for (const metric of metrics) {
      const timeDiff = Math.abs(metric.parsedTs.getTime() - targetTime.getTime());
      if (timeDiff <= toleranceMs) {
        return metric.original;
      }
    }

    return null;
  }

  /**
   * Removes metrics older than the specified cutoff time
   * @param cutoffTime Metrics before this time will be removed
   */
  async cleanupOldMetrics(cutoffTime: Date): Promise<void> {
    const allMetrics = await this.getAllMetrics();
    const recentMetrics = allMetrics.filter((m) => new Date(m.ts) >= cutoffTime);

    if (recentMetrics.length !== allMetrics.length) {
      // Rewrite file with only recent metrics
      const lines = recentMetrics.map((m) => JSON.stringify(m)).join("\n");
      const content = lines.length > 0 ? lines + "\n" : "";
      await Deno.writeTextFile(this.filePath, content);
    }
  }
}
