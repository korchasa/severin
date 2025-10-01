/**
 * CPU metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * CPU metrics collector
 */
export class CpuCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      const output = await sh(`vmstat 1 2 | tail -1 | awk '{printf("%.1f\\n", 100-$15)}'`).output();

      if (output.success) {
        const stdout = output.stdoutText();
        return [{
          name: "cpu_usage_percent",
          value: parseFloat(stdout),
          unit: "%",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect CPU metrics:", error);
      return [{
        name: "cpu_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
