/**
 * Failed systemd units metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Failed systemd units metrics collector
 */
export class SystemdFailedCollector {
  async collect(): Promise<MetricValue[]> {
    const ts = new Date().toISOString();

    try {
      const output = await sh(`systemctl --failed --no-pager | grep  "failed" || true`, {
        strict: false,
      })
        .output();

      if (output.success) {
        const stdout = output.stdoutText();
        const failedCount = parseInt(stdout.trim()) || 0;
        return [{
          name: "systemd_failed_units_count",
          value: failedCount,
          unit: "count",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect systemd failed units metrics:", error);
      return [{
        name: "systemd_failed_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
