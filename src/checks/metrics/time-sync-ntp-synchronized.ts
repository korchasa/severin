/**
 * Time synchronization metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Time synchronization metrics collector
 */
export class TimeSyncCollector {
  async collect(): Promise<MetricValue[]> {
    const ts = new Date().toISOString();

    try {
      const output = await sh(
        `timedatectl status | grep "System clock synchronized" | awk '{print $4}' | tr '[:upper:]' '[:lower:]'`,
      ).output();

      if (output.success) {
        const stdout = output.stdoutText().trim();
        const isSynced = stdout === "yes" ? 1 : 0;
        return [{
          name: "time_sync_ntp_synchronized",
          value: isSynced,
          unit: "bool",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect time sync metrics:", error);
      return [{
        name: "time_sync_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
