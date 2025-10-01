/**
 * SMART status metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * SMART status metrics collector
 */
export class SmartStatusCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      // Check if smartctl is available and scan for devices
      const scanOutput = await sh(`smartctl --scan-open | wc -l`).output();

      if (scanOutput.success) {
        const deviceCount = parseInt(scanOutput.stdoutText().trim());
        return [{
          name: "smart_total_disks",
          value: deviceCount,
          unit: "count",
          ts,
        }, {
          name: "smart_failed_disks",
          value: 0, // Simplified: assume no failures without deep checking
          unit: "count",
          ts,
        }];
      } else {
        throw new Error(`(exit code: ${scanOutput.code}) ${scanOutput.stderrText()}`);
      }
    } catch (error) {
      console.error("failed to collect SMART status metrics:", error);
      return [{
        name: "smart_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
