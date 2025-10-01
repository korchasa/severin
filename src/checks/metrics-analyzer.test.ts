/**
 * Metrics analyzer tests - validates historical comparison and context building logic
 *
 * Tests cover:
 * - Percentage difference calculations
 * - Significant change filtering
 * - Analysis context building with inline changes
 * - Multiple time period change formatting
 * - Diff formatting with proper signs
 */

import { assert, assertEquals } from "@std/assert";
import type { MetricValue } from "./types.ts";
import { MetricsAnalyzer } from "./metrics-analyzer.ts";

Deno.test("MetricsAnalyzer - calculates percentage differences", () => {
  const analyzer = new MetricsAnalyzer();

  const current: MetricValue = {
    name: "cpu_usage_percent",
    value: 75,
    unit: "%",
    ts: "2025-09-23T10:05:00.000Z",
  };

  const historical: MetricValue = {
    name: "cpu_usage_percent",
    value: 50,
    unit: "%",
    ts: "2025-09-23T10:00:00.000Z",
  };

  const diff = analyzer.calculatePercentageDiff(current, historical);
  assertEquals(diff, 50); // 50% increase
});

Deno.test("MetricsAnalyzer - handles zero historical values", () => {
  const analyzer = new MetricsAnalyzer();

  const current: MetricValue = {
    name: "cpu_usage_percent",
    value: 10,
    unit: "%",
    ts: "2025-09-23T10:05:00.000Z",
  };

  const historical: MetricValue = {
    name: "cpu_usage_percent",
    value: 0,
    unit: "%",
    ts: "2025-09-23T10:00:00.000Z",
  };

  const diff = analyzer.calculatePercentageDiff(current, historical);
  assertEquals(diff, null); // Cannot calculate percentage when historical is 0
});

Deno.test("MetricsAnalyzer - filters significant changes", () => {
  const analyzer = new MetricsAnalyzer();

  const changes = [
    {
      name: "cpu_usage_percent",
      diff: 5,
      current: 55,
      historical: 50,
      historicalTs: "2025-09-23T10:00:00.000Z",
    },
    {
      name: "memory_usage_percent",
      diff: 25,
      current: 75,
      historical: 50,
      historicalTs: "2025-09-23T10:00:00.000Z",
    },
    {
      name: "disk_free_percent",
      diff: -15,
      current: 20,
      historical: 35,
      historicalTs: "2025-09-23T10:00:00.000Z",
    },
  ];

  const significant = analyzer.filterSignificantChanges(changes, 10);
  assertEquals(significant.length, 2);
  assertEquals(significant[0].name, "memory_usage_percent");
  assertEquals(significant[1].name, "disk_free_percent");
});

Deno.test("MetricsAnalyzer - builds analysis context", () => {
  const analyzer = new MetricsAnalyzer();

  // Test data: CPU has significant change, memory does not
  const currentMetrics: MetricValue[] = [
    {
      name: "cpu_usage_percent",
      value: 75,
      unit: "%",
      ts: "2025-09-23T10:05:00.000Z",
    },
    {
      name: "memory_usage_percent",
      value: 80,
      unit: "%",
      ts: "2025-09-23T10:05:00.000Z",
    },
  ];

  // Only CPU has a significant change (50% increase)
  const changes = [
    {
      name: "cpu_usage_percent",
      diff: 50,
      current: 75,
      historical: 50,
      historicalTs: "2025-09-23T10:00:00.000Z", // 5 minutes ago
    },
  ];

  const context = analyzer.buildAnalysisContext(currentMetrics, changes, [5, 30]);

  // CPU should show change inline: "cpu_usage_percent: 75% (+50.00% from 5 min ago)"
  assert(context.includes("cpu_usage_percent: 75% (+50.00% from 5 min ago)"));
  // Memory should show no changes: "memory_usage_percent: 80%"
  assert(context.includes("memory_usage_percent: 80%"));
});

Deno.test("MetricsAnalyzer - builds analysis context with multiple time periods", () => {
  const analyzer = new MetricsAnalyzer();

  // Test case matching the user's example: cpu_usage_percent: 4 (+33.33% from 5 min ago, -10% from 30 min ago)
  const currentMetrics: MetricValue[] = [
    {
      name: "cpu_usage_percent",
      value: 4,
      unit: "%",
      ts: "2025-09-23T10:05:00.000Z", // Current time
    },
  ];

  // Two significant changes for the same metric at different time periods
  const changes = [
    {
      name: "cpu_usage_percent",
      diff: 33.33, // +33.33% increase
      current: 4,
      historical: 3, // from 3 to 4
      historicalTs: "2025-09-23T10:00:00.000Z", // 5 minutes ago
    },
    {
      name: "cpu_usage_percent",
      diff: -10, // -10% decrease
      current: 4,
      historical: 4.4, // from 4.4 to 4
      historicalTs: "2025-09-23T09:35:00.000Z", // 30 minutes ago
    },
  ];

  const context = analyzer.buildAnalysisContext(currentMetrics, changes, [5, 30]);

  assert(
    context.includes("cpu_usage_percent: 4% (+33.33% from 5 min ago, -10.00% from 30 min ago)"),
  );
});

Deno.test("MetricsAnalyzer - formats diff with sign", () => {
  const analyzer = new MetricsAnalyzer();

  assertEquals(analyzer.formatDiff(50), "+50.00%");
  assertEquals(analyzer.formatDiff(-25), "-25.00%");
  assertEquals(analyzer.formatDiff(0), "+0.00%");
  assertEquals(analyzer.formatDiff(null), "");
  assertEquals(analyzer.formatDiff(Infinity), "+∞%");
  assertEquals(analyzer.formatDiff(-Infinity), "-∞%");
});
