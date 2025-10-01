/**
 * Temperature sensors metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Temperature sensors metrics collector
 */
export class TemperatureCollector {
  async collect(): Promise<MetricValue[]> {
    const ts = new Date().toISOString();

    try {
      const output = await sh(
        `sensors | awk '/°C/ {gsub("[+°C]", "", $2); if($2 > max) max=$2} END {print max+0}'`,
      ).output();

      if (output.success) {
        const stdout = output.stdoutText();
        const maxTemp = parseFloat(stdout);
        if (!isNaN(maxTemp)) {
          return [{
            name: "temperature_max_celsius",
            value: maxTemp,
            unit: "°C",
            ts,
          }];
        }
      }

      throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
    } catch (error) {
      console.error("failed to collect temperature metrics:", error);
      return [{
        name: "temperature_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
