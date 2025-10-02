/**
 * Disk metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Disk metrics collector
 */
export class DiskCollector {
  async collect(): Promise<MetricValue[]> {
    const ts = new Date().toISOString();

    try {
      const output = await sh(`df -kP / | awk 'NR==2 {gsub("%",""); print 100-$5}'`).output();

      if (output.success) {
        const stdout = output.stdoutText();
        return [{
          name: "disk_free_percent",
          value: parseFloat(stdout),
          unit: "%",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect disk metrics:", error);
      return [{
        name: "disk_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
