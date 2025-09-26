/**
 * Network errors metrics collector
 */

import type { MetricValue } from "../../core/types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Network errors metrics collector
 */
export class NetworkErrorsCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      const output = await sh(
        `ip -s link | grep -A 5 "RX:" | grep "errors" | awk '{sum+=$1} END {print sum+0}'`,
      ).output();

      if (output.success) {
        const stdout = output.stdoutText();
        const totalErrors = parseInt(stdout) || 0;
        return [{
          name: "network_errors_total",
          value: totalErrors,
          unit: "count",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect network errors metrics:", error);
      return [{
        name: "network_errors_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
