/**
 * Network latency metrics collector
 */

import type { MetricValue } from "../../core/types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Network latency metrics collector
 */
export class NetworkLatencyCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      const output = await sh(`ping -c 3 -W 1 8.8.8.8 | tail -1 | awk -F'/' '{print $5}'`).output();

      if (output.success) {
        const stdout = output.stdoutText();
        const avgRtt = parseFloat(stdout.trim()) || 0;
        return [{
          name: "network_latency_avg_ms",
          value: avgRtt,
          unit: "ms",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${output.code}) ${output.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect network latency metrics:", error);
      return [{
        name: "network_latency_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
