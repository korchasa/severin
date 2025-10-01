/**
 * Top CPU processes metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Top CPU processes metrics collector
 */
export class TopCpuProcessesCollector {
  async collect(): Promise<MetricValue[]> {
    const ts = new Date().toISOString();

    try {
      const output = await sh(
        `ps aux --sort=-%cpu | head -6 | tail -5 | awk '{sum+=$3} END {printf "%.1f\\n", sum}'`,
      ).output();

      if (output.success) {
        const stdout = output.stdoutText();
        return [{
          name: "top_cpu_processes_total_cpu_percent",
          value: parseFloat(stdout),
          unit: "%",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect top CPU processes metrics:", error);
      return [{
        name: "top_cpu_processes_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
