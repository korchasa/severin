/**
 * Inodes usage metrics collector
 */

import type { MetricValue } from "../../core/types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Inodes usage metrics collector
 */
export class InodesCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      const output = await sh(`df -i / | tail -1 | awk '{print $5}' | sed 's/%//'`).output();

      if (output.success) {
        const stdout = output.stdoutText();
        const inodeUsagePercent = parseFloat(stdout.trim()) || 0;
        return [{
          name: "inodes_usage_percent",
          value: inodeUsagePercent,
          unit: "%",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect inodes metrics:", error);
      return [{
        name: "inodes_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
