/**
 * Checks engine - coordinates all system health checks
 */

import type { MetricValue } from "./types.ts";
import type { Config } from "../config/config.ts";
import { regularCollectors, sensitiveCollectors } from "./metrics/index.ts";
import { log } from "../utils/logger.ts";

/**
 * Runs all checks and collects metrics for historical analysis.
 *
 * To avoid CPU-sensitive collectors influencing their own measurements,
 * CPU metrics are collected sequentially first, then all other metrics
 * are collected in parallel.
 */
export async function runAllChecksForMetrics(_config: Config): Promise<MetricValue[]> {
  const allMetrics: MetricValue[] = [];
  let totalSuccessCount = 0;
  let totalErrorCount = 0;

  // Phase 1: Collect CPU-sensitive metrics sequentially to avoid influencing measurements
  log({
    mod: "checks",
    event: "sensitive_collection_start",
    sensitive_collectors_count: sensitiveCollectors.length,
  });

  for (const CollectorClass of sensitiveCollectors) {
    // Add pause before collecting each sensitive metric to prevent interference
    await new Promise((resolve) => setTimeout(resolve, _config.metrics.sensitiveCollectionDelayMs));

    const collector = new CollectorClass();
    const startTime = performance.now();

    try {
      const metrics = await collector.collect();
      const duration = performance.now() - startTime;
      log({
        mod: "checks",
        event: "collector_completed",
        collector: collector.constructor.name,
        phase: "sensitive",
        metrics_count: metrics.length,
        duration_ms: Math.round(duration),
      });
      allMetrics.push(...metrics);
      totalSuccessCount++;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`Sensitive collector ${collector.constructor.name} failed:`, error);
      log({
        mod: "checks",
        event: "collector_error",
        collector: collector.constructor.name,
        phase: "sensitive",
        error: (error as Error).message,
        duration_ms: Math.round(duration),
      });
      totalErrorCount++;
    }
  }

  // Phase 2: Collect regular metrics in parallel
  log({
    mod: "checks",
    event: "regular_collection_start",
    regular_collectors_count: regularCollectors.length,
  });

  const regularPromises = regularCollectors.map(async (CollectorClass) => {
    const collector = new CollectorClass();
    const startTime = performance.now();
    try {
      const metrics = await collector.collect();
      const duration = performance.now() - startTime;
      log({
        mod: "checks",
        event: "collector_completed",
        collector: collector.constructor.name,
        phase: "regular",
        metrics_count: metrics.length,
        duration_ms: Math.round(duration),
      });
      return { success: true, metrics };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`Regular collector ${collector.constructor.name} failed:`, error);
      log({
        mod: "checks",
        event: "collector_error",
        collector: collector.constructor.name,
        phase: "regular",
        error: (error as Error).message,
        duration_ms: Math.round(duration),
      });
      return { success: false, error, collector: collector.constructor.name };
    }
  });

  const regularResults = await Promise.all(regularPromises);

  // Process regular collection results
  for (const result of regularResults) {
    if (result.success && result.metrics) {
      allMetrics.push(...result.metrics);
      totalSuccessCount++;
    } else {
      totalErrorCount++;
    }
  }

  log({
    mod: "checks",
    event: "metrics_collection_complete",
    sensitive_collectors: sensitiveCollectors.length,
    regular_collectors: regularCollectors.length,
    total_collectors: sensitiveCollectors.length + regularCollectors.length,
    successful: totalSuccessCount,
    failed: totalErrorCount,
    total_metrics: allMetrics.length,
  });

  return allMetrics;
}
