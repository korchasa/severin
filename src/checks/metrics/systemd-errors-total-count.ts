/**
 * Systemd errors metrics collector
 */

import type { MetricValue } from "../../core/types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Systemd errors metrics collector
 */
export class SystemdErrorsCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      const output = await sh(`journalctl -p 3 -xb --no-pager | wc -l`).output();

      if (output.success) {
        const stdout = output.stdoutText();
        const errorCount = parseInt(stdout.trim()) || 0;
        return [{
          name: "systemd_errors_total_count",
          value: errorCount,
          unit: "count",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect systemd errors metrics:", error);
      return [{
        name: "systemd_errors_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
