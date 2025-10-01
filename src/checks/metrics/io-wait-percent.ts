/**
 * I/O wait metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * I/O wait metrics collector
 */
export class IoWaitCollector {
  async collect(): Promise<MetricValue[]> {
    const ts = new Date().toISOString();

    try {
      const output = await sh(`vmstat 1 2 | tail -1 | awk '{print $16}'`).output();

      if (output.success) {
        const stdout = output.stdoutText();
        const ioWaitPercent = parseFloat(stdout.trim()) || 0;
        return [{
          name: "io_wait_percent",
          value: ioWaitPercent,
          unit: "%",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect I/O wait metrics:", error);
      return [{
        name: "io_wait_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
