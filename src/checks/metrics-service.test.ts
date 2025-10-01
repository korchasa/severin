/**
 * Metrics service tests - validates metrics storage and retrieval
 */

import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import type { MetricValue } from "./types.ts";
import { MetricsService } from "./metrics-service.ts";

Deno.test("MetricsService - stores and retrieves metrics", async () => {
  const testDir = await Deno.makeTempDir();
  const metricsFile = join(testDir, "metrics.jsonl");

  try {
    const service = new MetricsService(metricsFile);

    const metrics: MetricValue[] = [
      {
        name: "cpu_usage",
        value: 50,
        unit: "%",
        ts: "2025-09-23T10:00:00.000Z",
      },
      {
        name: "memory_usage",
        value: 60,
        unit: "%",
        ts: "2025-09-23T10:00:00.000Z",
      },
    ];

    // Store metrics
    await service.storeMetrics(metrics);

    // Retrieve all metrics
    const allMetrics = await service.getAllMetrics();
    assertEquals(allMetrics.length, 2);
    assertEquals(allMetrics[0].name, "cpu_usage");
    assertEquals(allMetrics[0].value, 50);
    assertEquals(allMetrics[1].name, "memory_usage");
    assertEquals(allMetrics[1].value, 60);

    // Store additional metrics
    const moreMetrics: MetricValue[] = [
      {
        name: "disk_usage",
        value: 70,
        unit: "%",
        ts: "2025-09-23T10:05:00.000Z",
      },
    ];
    await service.storeMetrics(moreMetrics);

    const updatedMetrics = await service.getAllMetrics();
    assertEquals(updatedMetrics.length, 3);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("MetricsService - finds metrics by time range", async () => {
  const testDir = await Deno.makeTempDir();
  const metricsFile = join(testDir, "metrics.jsonl");

  try {
    const service = new MetricsService(metricsFile);

    // Store metrics at different times
    const metrics: MetricValue[] = [
      {
        name: "cpu_usage",
        value: 50,
        unit: "%",
        ts: "2025-09-23T10:00:00.000Z", // 10:00
      },
      {
        name: "cpu_usage",
        value: 55,
        unit: "%",
        ts: "2025-09-23T10:05:00.000Z", // 10:05
      },
      {
        name: "cpu_usage",
        value: 60,
        unit: "%",
        ts: "2025-09-23T10:10:00.000Z", // 10:10
      },
    ];

    await service.storeMetrics(metrics);

    // Find metrics 5 minutes ago from 10:10
    const fiveMinAgo = new Date("2025-09-23T10:05:00.000Z");
    const result = await service.findMetricsAtTime("cpu_usage", fiveMinAgo, 1 * 60 * 1000); // 1 min tolerance

    assert(result !== null);
    assertEquals(result.value, 55);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("MetricsService - calculates percentage differences", async () => {
  const testDir = await Deno.makeTempDir();
  const metricsFile = join(testDir, "metrics.jsonl");

  try {
    const service = new MetricsService(metricsFile);

    const metrics: MetricValue[] = [
      {
        name: "cpu_usage",
        value: 50,
        unit: "%",
        ts: "2025-09-23T10:00:00.000Z",
      },
      {
        name: "cpu_usage",
        value: 75,
        unit: "%",
        ts: "2025-09-23T10:05:00.000Z",
      },
    ];

    await service.storeMetrics(metrics);

    const currentTime = new Date("2025-09-23T10:05:00.000Z");
    const pastTime = new Date("2025-09-23T10:00:00.000Z");

    const current = await service.findMetricsAtTime("cpu_usage", currentTime, 1000);
    const past = await service.findMetricsAtTime("cpu_usage", pastTime, 1000);

    assert(current !== null);
    assert(past !== null);

    const diff = ((current.value - past.value) / past.value) * 100;
    assertEquals(diff, 50); // 50% increase from 50 to 75
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});

Deno.test("MetricsService - cleans up old metrics", async () => {
  const testDir = await Deno.makeTempDir();
  const metricsFile = join(testDir, "metrics.jsonl");

  try {
    const service = new MetricsService(metricsFile);

    // Store old metrics (2 hours ago)
    const oldMetrics: MetricValue[] = [
      {
        name: "cpu_usage",
        value: 50,
        unit: "%",
        ts: "2025-09-23T08:00:00.000Z",
      },
    ];

    // Store recent metrics
    const recentMetrics: MetricValue[] = [
      {
        name: "cpu_usage",
        value: 60,
        unit: "%",
        ts: "2025-09-23T10:00:00.000Z",
      },
    ];

    await service.storeMetrics(oldMetrics);
    await service.storeMetrics(recentMetrics);

    // Cleanup metrics older than 1 hour
    const cutoffTime = new Date("2025-09-23T09:00:00.000Z");
    await service.cleanupOldMetrics(cutoffTime);

    const remaining = await service.getAllMetrics();
    assertEquals(remaining.length, 1);
    assertEquals(remaining[0].value, 60);
  } finally {
    await Deno.remove(testDir, { recursive: true });
  }
});
