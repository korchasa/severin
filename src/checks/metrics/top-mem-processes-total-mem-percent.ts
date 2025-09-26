/**
 * Top memory processes metrics collector
 */

import type { MetricValue } from "../../core/types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Top memory processes metrics collector
 */
export class TopMemProcessesCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      const output = await sh(
        `ps aux --sort=-%mem | head -6 | tail -5 | awk '{sum+=$4} END {printf "%.1f\\n", sum}'`,
      ).output();

      if (output.success) {
        const stdout = output.stdoutText();
        return [{
          name: "top_mem_processes_total_mem_percent",
          value: parseFloat(stdout),
          unit: "%",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect top memory processes metrics:", error);
      return [{
        name: "top_mem_processes_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
