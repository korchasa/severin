/**
 * Disk IOPS metrics collector
 */

import type { MetricValue } from "../../core/types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Disk IOPS metrics collector
 */
export class DiskIopsCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      const output = await sh(
        `iostat -dx 1 2 | awk '/^Device:/{flag=1; next} flag && NF>0 && !/^avg-cpu/ && !/^Device:/ {sum+=$4+$5} END {print int(sum)}'`,
      ).output();

      if (output.success) {
        const stdout = output.stdoutText();
        const totalIops = parseFloat(stdout) || 0;
        return [{
          name: "disk_total_iops",
          value: totalIops,
          unit: "iops",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect disk IOPS metrics:", error);
      return [{
        name: "disk_iops_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
