/**
 * General CPU usage metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * General CPU usage metrics collector
 */
export class CpuGeneralCollector {
  async collect(): Promise<MetricValue[]> {
    const ts = new Date().toISOString();

    try {
      const output = await sh(
        `top -bn1 | grep '%Cpu(s)' | awk -F'[, ]+' '{us=$2+0; sy=$4+0; ni=$6+0; printf "%.1f\\n", us+sy+ni}'`,
      ).output();

      if (output.success) {
        const stdout = output.stdoutText();
        return [{
          name: "cpu_usage_total_percent",
          value: parseFloat(stdout),
          unit: "%",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect general CPU metrics:", error);
      return [{
        name: "cpu_general_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
