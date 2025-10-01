/**
 * Swap usage metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Swap usage metrics collector
 */
export class SwapUsageCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      const output = await sh(
        `free | awk 'NR==3 {if($2>0) printf "%.1f\\n", $3*100/$2; else print "0"}'`,
      ).output();

      if (output.success) {
        const stdout = output.stdoutText();
        return [{
          name: "swap_total_usage_percent",
          value: parseFloat(stdout),
          unit: "%",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect swap usage metrics:", error);
      return [{
        name: "swap_usage_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
