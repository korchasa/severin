/**
 * Memory metrics collector
 */

import type { MetricValue } from "../../core/types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Memory metrics collector
 */
export class MemoryCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      const output = await sh(`free | awk 'NR==2{printf "%.1f\\n", $3*100/$2}'`).output();

      if (output.success) {
        const stdout = output.stdoutText();
        return [{
          name: "memory_usage_percent",
          value: parseFloat(stdout),
          unit: "%",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect memory metrics:", error);
      return [{
        name: "memory_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
