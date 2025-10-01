/**
 * Load average metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Load average metrics collector
 */
export class LoadAvgCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      const output = await sh(`uptime | awk -F'load average:' '{print $2}' | sed 's/,//g'`)
        .output();

      if (output.success) {
        const stdout = output.stdoutText().trim();
        const loads = stdout.split(/\s+/).map(parseFloat);

        const metrics: MetricValue[] = [];
        if (loads.length >= 1 && !isNaN(loads[0])) {
          metrics.push({
            name: "load_avg_1min",
            value: loads[0],
            unit: "load",
            ts,
          });
        }
        if (loads.length >= 2 && !isNaN(loads[1])) {
          metrics.push({
            name: "load_avg_5min",
            value: loads[1],
            unit: "load",
            ts,
          });
        }
        if (loads.length >= 3 && !isNaN(loads[2])) {
          metrics.push({
            name: "load_avg_15min",
            value: loads[2],
            unit: "load",
            ts,
          });
        }

        if (metrics.length > 0) {
          return metrics;
        }
      }

      throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
    } catch (error) {
      console.error("failed to collect load average metrics:", error);
      return [{
        name: "load_avg_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
