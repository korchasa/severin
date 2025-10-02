/**
 * CPU queue metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";
import { log } from "../../utils/logger.ts";

/**
 * CPU queue metrics collector
 */
export class CpuQueueCollector {
  async collect(): Promise<MetricValue[]> {
    const ts = new Date().toISOString();

    try {
      const output = await sh(`vmstat 1 2 | tail -1 | awk '{print $1+$2}'`).output();

      if (output.success) {
        const stdout = output.stdoutText();
        return [{
          name: "cpu_total_queue_length",
          value: parseFloat(stdout),
          unit: "count",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      log({
        mod: "checks",
        level: "warning",
        message: "failed to collect CPU queue metrics",
        error: (error as Error).message,
      });
      return [{
        name: "cpu_queue_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
