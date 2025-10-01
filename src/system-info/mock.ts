/**
 * Mock implementations for SystemInfo testing
 */

import { SystemInfo } from "./system-info.ts";

export function createMockSystemInfo(): SystemInfo {
  const systemInfo = new SystemInfo();
  systemInfo.identification.hostname = "test-host";
  return systemInfo;
}
