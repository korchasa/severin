/**
 * Metrics collectors
 */

import { CpuCollector } from "./cpu-usage-percent.ts";
import { CpuGeneralCollector } from "./cpu-usage-total-percent.ts";
import { CpuQueueCollector } from "./cpu-total-queue-length.ts";
import { MemoryCollector } from "./memory-usage-percent.ts";
import { SwapUsageCollector } from "./swap-total-usage-percent.ts";
import { DiskCollector } from "./disk-free-percent.ts";
import { LoadAvgCollector } from "./load-avg.ts";
import { TopCpuProcessesCollector } from "./top-cpu-processes-total-cpu-percent.ts";
import { TopMemProcessesCollector } from "./top-mem-processes-total-mem-percent.ts";
import { IoWaitCollector } from "./io-wait-percent.ts";
import { DiskIopsCollector } from "./disk-total-iops.ts";
import { InodesCollector } from "./inodes-usage-percent.ts";
import { SmartStatusCollector } from "./smart-total-disks.ts";
import { KernelErrorsCollector } from "./kernel-errors-count.ts";
import { SystemdErrorsCollector } from "./systemd-errors-total-count.ts";
import { SystemdFailedCollector } from "./systemd-failed-units-count.ts";
import { NetworkErrorsCollector } from "./network-errors-total.ts";
import { NetworkLatencyCollector } from "./network-latency-avg-ms.ts";
import { TimeSyncCollector } from "./time-sync-ntp-synchronized.ts";
import { TemperatureCollector } from "./temperature-max-celsius.ts";

export {
  CpuCollector,
  CpuGeneralCollector,
  CpuQueueCollector,
  DiskCollector,
  DiskIopsCollector,
  InodesCollector,
  IoWaitCollector,
  KernelErrorsCollector,
  LoadAvgCollector,
  MemoryCollector,
  NetworkErrorsCollector,
  NetworkLatencyCollector,
  SmartStatusCollector,
  SwapUsageCollector,
  SystemdErrorsCollector,
  SystemdFailedCollector,
  TemperatureCollector,
  TimeSyncCollector,
  TopCpuProcessesCollector,
  TopMemProcessesCollector,
};

// CPU-sensitive collectors that should be collected sequentially to avoid
// influencing their own measurements during parallel collection
export const sensitiveCollectors = [
  CpuCollector,
  CpuGeneralCollector,
  CpuQueueCollector,
];

// Regular collectors that can be collected in parallel without affecting CPU metrics
export const regularCollectors = [
  MemoryCollector,
  SwapUsageCollector,
  DiskCollector,
  LoadAvgCollector,
  TopCpuProcessesCollector,
  TopMemProcessesCollector,
  IoWaitCollector,
  DiskIopsCollector,
  InodesCollector,
  SmartStatusCollector,
  KernelErrorsCollector,
  SystemdErrorsCollector,
  SystemdFailedCollector,
  NetworkErrorsCollector,
  NetworkLatencyCollector,
  TimeSyncCollector,
  TemperatureCollector,
];

// Array of all collector classes for easy iteration (kept for backward compatibility)
export const allCollectors = [
  ...sensitiveCollectors,
  ...regularCollectors,
];
