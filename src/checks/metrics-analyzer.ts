/**
 * Metrics analyzer - handles historical comparison and change detection
 */

import type { MetricValue } from "./types.ts";

/**
 * Represents a significant change in a metric
 */
export interface MetricChange {
  readonly name: string;
  readonly diff: number | null; // percentage change, null if cannot be calculated
  readonly current: number;
  readonly historical: number;
  readonly historicalTs: string;
}

/**
 * Service for analyzing metrics changes over time
 */
export class MetricsAnalyzer {
  /**
   * Calculates percentage difference between current and historical values
   * @param current Current metric value
   * @param historical Historical metric value
   * @returns Percentage difference (positive = increase, negative = decrease), or null if cannot be calculated
   */
  calculatePercentageDiff(current: MetricValue, historical: MetricValue): number | null {
    const diff = current.value - historical.value;
    if (historical.value === 0) {
      // Cannot calculate percentage change when historical value is 0
      // This typically means the metric was reset or just started collecting
      return null;
    }
    return (diff / historical.value) * 100;
  }

  /**
   * Filters changes that exceed the significance threshold
   * @param changes Array of metric changes
   * @param threshold Minimum absolute percentage change to be considered significant
   * @returns Array of significant changes only
   */
  filterSignificantChanges(changes: MetricChange[], threshold: number): MetricChange[] {
    return changes.filter((change) => change.diff !== null && Math.abs(change.diff) >= threshold);
  }

  /**
   * Builds analysis context string for LLM analysis with changes inline in metric lines
   *
   * Instead of showing current metrics and changes separately, this method integrates
   * significant changes directly into each metric line for better readability.
   * Example output: "cpu_usage_percent: 4% (+33.33% from 5 min ago, -10% from 30 min ago)"
   *
   * @param currentMetrics Current metric values
   * @param significantChanges Significant changes found (filtered by threshold)
   * @param _comparisonMinutes Time periods used for comparison (unused, kept for API compatibility)
   * @returns Formatted context string for LLM with changes inline
   */
  buildAnalysisContext(
    currentMetrics: MetricValue[],
    significantChanges: MetricChange[],
    _comparisonMinutes: readonly number[],
  ): string {
    let context = "";

    // Group changes by metric name for efficient lookup when building metric lines
    // This allows us to quickly find all changes for each metric
    const changesByMetric = new Map<string, MetricChange[]>();
    for (const change of significantChanges) {
      if (!changesByMetric.has(change.name)) {
        changesByMetric.set(change.name, []);
      }
      changesByMetric.get(change.name)!.push(change);
    }

    // Build current metrics section with changes integrated inline
    const timestamp = currentMetrics.length > 0 ? currentMetrics[0].ts : new Date().toISOString();
    for (const metric of currentMetrics) {
      // Start with metric name and current value
      context += `- ${metric.name}: ${metric.value}${metric.unit}`;

      // Add significant changes for this metric directly in the line
      const metricChanges = changesByMetric.get(metric.name) || [];
      if (metricChanges.length > 0) {
        const changeParts: string[] = [];
        for (const change of metricChanges) {
          // Calculate how many minutes ago this change occurred
          // This gives context about which time period this change represents
          const currentTime = new Date(timestamp);
          const historicalTime = new Date(change.historicalTs);
          const minutesAgo = Math.round(
            (currentTime.getTime() - historicalTime.getTime()) / (1000 * 60),
          );

          // Format as "percentage from X min ago"
          changeParts.push(`${this.formatDiff(change.diff)} from ${minutesAgo} min ago`);
        }
        // Join multiple changes with commas for readability
        context += ` (${changeParts.join(", ")})`;
      }

      context += "\n";
    }

    return context;
  }

  /**
   * Formats percentage difference with sign and proper formatting
   * @param diff Percentage difference
   * @returns Formatted string like "+50.00%" or "-25.00%", or empty string if null
   */
  formatDiff(diff: number | null): string {
    if (diff === null) {
      return "";
    }

    if (!isFinite(diff)) {
      return diff > 0 ? "+∞%" : "-∞%";
    }

    const sign = diff >= 0 ? "+" : "";
    return `${sign}${diff.toFixed(2)}%`;
  }

  /**
   * Analyzes metrics against historical data
   * @param currentMetrics Current metric values
   * @param historicalData Function to retrieve historical metrics
   * @param config Metrics configuration
   * @returns Analysis result with significant changes
   */
  async analyzeMetrics(
    currentMetrics: MetricValue[],
    historicalData: (name: string, time: Date, tolerance: number) => Promise<MetricValue | null>,
    config: { changeThreshold: number; comparisonMinutes: readonly number[] },
  ): Promise<{
    significantChanges: MetricChange[];
    analysisContext: string;
  }> {
    const allChanges: MetricChange[] = [];

    for (const currentMetric of currentMetrics) {
      for (const minutes of config.comparisonMinutes) {
        const historicalTime = new Date(Date.now() - minutes * 60 * 1000);
        const historicalMetric = await historicalData(
          currentMetric.name,
          historicalTime,
          5 * 60 * 1000, // 5 minute tolerance
        );

        if (historicalMetric) {
          const diff = this.calculatePercentageDiff(currentMetric, historicalMetric);
          if (diff !== null) {
            allChanges.push({
              name: currentMetric.name,
              diff,
              current: currentMetric.value,
              historical: historicalMetric.value,
              historicalTs: historicalMetric.ts,
            });
          }
        }
      }
    }

    const significantChanges = this.filterSignificantChanges(allChanges, config.changeThreshold);
    const analysisContext = this.buildAnalysisContext(
      currentMetrics,
      significantChanges,
      config.comparisonMinutes,
    );

    return {
      significantChanges,
      analysisContext,
    };
  }
}
