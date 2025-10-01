/**
 * Kernel errors metrics collector
 */

import type { MetricValue } from "../types.ts";
import { sh } from "../../utils/sh.ts";

/**
 * Kernel errors metrics collector
 */
export class KernelErrorsCollector {
  async collect(): Promise<MetricValue[]> {
    const _startTime = performance.now();
    const ts = new Date().toISOString();

    try {
      let errorCount = 0;

      // Universal approach: try to get kernel errors from system logs
      // with fallbacks for different systems in priority order

      // 1. First try journalctl (systemd systems)
      try {
        const output = await sh(
          `journalctl --since "1 hour ago" --priority err,crit,alert,emerg --no-pager | wc -l`,
        ).output();
        if (output.success) {
          errorCount = parseInt(output.stdoutText().trim()) || 0;
        } else {
          throw new Error("journalctl failed");
        }
      } catch {
        // 2. Try to read from system logs (Linux)
        const logFiles = [
          "/var/log/kern.log",
          "/var/log/syslog",
          "/var/log/messages",
        ];

        for (const logFile of logFiles) {
          try {
            const output = await sh(
              `grep -i "kernel\|kern" "${logFile}" | grep -c -E "(error|err|crit|alert|emerg)"`,
            ).output();
            if (output.success) {
              errorCount = parseInt(output.stdoutText().trim()) || 0;
              break; // Found working source, exit loop
            }
          } catch {
            // Ignore error, try next file
            continue;
          }
        }

        // 3. If logs didn't work, try macOS/FreeBSD syslog
        if (errorCount === 0) {
          try {
            const output = await sh(
              `syslog -k Sender kernel -k Level NLEmergency,NLAlert,NLCritical,NLError | wc -l`,
            ).output();
            if (output.success) {
              errorCount = parseInt(output.stdoutText().trim()) || 0;
            }
          } catch {
            // Ignore error
          }
        }

        // 4. Last chance - dmesg (may require privileges, but sometimes works)
        if (errorCount === 0) {
          try {
            const output = await sh(`dmesg -l err,crit,alert,emerg 2>/dev/null | wc -l`).output();
            if (output.success) {
              errorCount = parseInt(output.stdoutText().trim()) || 0;
            }
          } catch {
            // Ignore error
          }
        }
      }

      return [{
        name: "kernel_errors_count",
        value: errorCount,
        unit: "count",
        ts,
      }];
    } catch (error) {
      console.error("failed to collect kernel errors metrics:", error);
      return [{
        name: "kernel_errors_error",
        value: 1,
        unit: "count",
        ts,
      }];
    }
  }
}
