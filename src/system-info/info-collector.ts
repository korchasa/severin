/**
 * System information collector for startup
 * Gathers comprehensive system information to include in the first system message
 */

import { log } from "../utils/logger.ts";
import { SystemInfo } from "./system-info.ts";

/**
 * Creates a new SystemInfo instance
 */
function createSystemInfo(): SystemInfo {
  return new SystemInfo();
}

/**
 * Command definitions for system information collection
 */
const SYSTEM_COMMANDS = {
  // Identification and OS
  hostname: { command: "hostname", description: "System hostname" },
  osRelease: { command: "cat", args: ["/etc/os-release"], description: "OS distribution info" },
  kernel: { command: "uname", args: ["-r"], description: "Kernel version" },
  arch: { command: "uname", args: ["-m"], description: "System architecture" },

  // Users
  activeUsers: { command: "who", description: "Active user sessions" },

  // Hardware platform / virtualization
  cpu: { command: "cat", args: ["/proc/cpuinfo"], description: "CPU information" },
  memory: { command: "cat", args: ["/proc/meminfo"], description: "Memory information" },
  virtualization: {
    command: "sh",
    args: [
      "-c",
      "grep -q 'hypervisor' /proc/cpuinfo && echo 'kvm' || dmesg | grep -q 'Hypervisor detected' && echo 'kvm' || echo 'none'",
    ],
    description: "Virtualization detection",
  },

  // Disks and FS
  blockDevices: { command: "cat", args: ["/proc/partitions"], description: "Block devices" },
  mounts: { command: "cat", args: ["/proc/mounts"], description: "Mount points" },

  // Network
  networkAddresses: { command: "ifconfig", args: ["-a"], description: "Network addresses" },
  dnsConfig: { command: "cat", args: ["/etc/resolv.conf"], description: "DNS configuration" },

  // System
  initSystem: {
    command: "ps",
    args: ["-p", "1", "-o", "comm="],
    description: "Init system (PID 1)",
  },
  serviceManager: {
    command: "cat",
    args: ["/proc/1/cmdline"],
    description: "Service manager detection",
  },
  firewallType: {
    command: "sh",
    args: [
      "-c",
      "if systemctl is-active --quiet ufw 2>/dev/null; then echo 'ufw'; elif systemctl is-active --quiet firewalld 2>/dev/null; then echo 'firewalld'; elif nft list ruleset >/dev/null 2>&1; then echo 'nftables'; elif iptables -S >/dev/null 2>&1; then echo 'iptables'; else echo 'none'; fi",
    ],
    description: "Firewall type detection",
  },
  packageManager: {
    command: "sh",
    args: [
      "-c",
      "if command -v apt >/dev/null 2>&1; then echo 'apt'; elif command -v dnf >/dev/null 2>&1; then echo 'dnf'; elif command -v yum >/dev/null 2>&1; then echo 'yum'; elif command -v pacman >/dev/null 2>&1; then echo 'pacman'; elif command -v apk >/dev/null 2>&1; then echo 'apk'; else echo 'unknown'; fi",
    ],
    description: "Package manager detection",
  },
  containerRuntime: {
    command: "sh",
    args: [
      "-c",
      "if command -v docker >/dev/null 2>&1; then echo 'docker'; elif command -v podman >/dev/null 2>&1; then echo 'podman'; elif command -v containerd >/dev/null 2>&1; then echo 'containerd'; else echo 'none'; fi",
    ],
    description: "Container runtime detection",
  },

  // Security
  firewall: {
    command: "sh",
    args: [
      "-c",
      "sudo nft list ruleset 2>/dev/null || sudo iptables -S 2>/dev/null || echo 'No firewall detected'",
    ],
    description: "Firewall rules",
  },
  securityModules: {
    command: "sh",
    args: ["-c", "sestatus 2>/dev/null || aa-status 2>/dev/null || echo 'No security modules'"],
    description: "Security modules status",
  },

  // Time
  currentTime: { command: "date", args: ["+%Y-%m-%dT%H:%M:%S%z"], description: "Current time" },
  timezone: { command: "date", args: ["+%Z"], description: "Timezone configuration" },

  // Logs/kernel
  criticalJournal: {
    command: "sh",
    args: [
      "-c",
      "if [ -f /var/log/syslog ]; then tail -20 /var/log/syslog; elif [ -f /var/log/messages ]; then tail -20 /var/log/messages; else echo 'No system logs available'; fi",
    ],
    description: "Recent system log entries",
  },
  kernelMessages: {
    command: "sh",
    args: ["-c", "dmesg -T | head -20"],
    description: "Recent kernel messages",
  },

  // Cloud (with error handling)
  awsMetadata: {
    command: "sh",
    args: [
      "-c",
      "curl -s --max-time 5 http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo 'Not AWS'",
    ],
    description: "AWS instance metadata",
  },
  gcpMetadata: {
    command: "sh",
    args: [
      "-c",
      "curl -H 'Metadata-Flavor: Google' -s --max-time 5 http://169.254.169.254/computeMetadata/v1/instance/hostname 2>/dev/null || echo 'Not GCP'",
    ],
    description: "GCP instance metadata",
  },
  azureMetadata: {
    command: "sh",
    args: [
      "-c",
      "curl -H 'Metadata:true' -s --max-time 5 'http://169.254.169.254/metadata/instance/compute/vmId?api-version=2021-02-01' 2>/dev/null || echo 'Not Azure'",
    ],
    description: "Azure instance metadata",
  },
} as const;

/**
 * Safely executes a system command and returns its output or undefined on error
 */
async function safeExecuteCommand(
  cmd: { command: string; args?: readonly string[]; description: string },
): Promise<string | undefined> {
  try {
    const command = new Deno.Command(cmd.command, {
      args: cmd.args ? [...cmd.args] : undefined,
      stdin: "null",
      stdout: "piped",
      stderr: "null", // Ignore stderr for system info collection
    });

    const process = command.spawn();
    const { code, stdout } = await process.output();

    if (code === 0) {
      const output = new TextDecoder().decode(stdout).trim();
      return output || undefined;
    }
  } catch (error) {
    // Log the error but don't fail the entire collection
    log({
      mod: "system-info",
      event: "command_failed",
      command: cmd.command,
      args: cmd.args,
      error: (error as Error).message,
    });
  }
  return undefined;
}

/**
 * Collects comprehensive system information at startup
 */
export async function collectSystemInfo(): Promise<SystemInfo> {
  log({ mod: "system-info", event: "collection_started" });

  const results = createSystemInfo();

  // Execute all commands in parallel for efficiency
  const commandPromises = Object.entries(SYSTEM_COMMANDS).map(async ([key, cmd]) => {
    const output = await safeExecuteCommand(cmd);
    return { key, output };
  });

  const commandResults = await Promise.all(commandPromises);

  // Map results to the structured output with concise single-line values
  for (const { key, output } of commandResults) {
    if (!output) continue;

    switch (key) {
      case "hostname": {
        // hostname command returns hostname directly
        results.identification.hostname = output.trim() || "unknown";
        break;
      }

      case "osRelease": {
        // Extract PRETTY_NAME value
        const prettyNameMatch = output.match(/PRETTY_NAME="([^"]+)"/);
        results.identification.osRelease = prettyNameMatch ? prettyNameMatch[1] : "unknown";
        break;
      }

      case "kernel": {
        results.identification.kernel = output.trim();
        break;
      }

      case "arch": {
        results.identification.arch = output.trim();
        break;
      }

      case "cpu": {
        // Extract CPU model and core count from /proc/cpuinfo
        const lines = output.split("\n");
        let cpuModel: string | undefined;
        let cpuCount: number | undefined;

        // Find model name (usually the first processor entry)
        for (const line of lines) {
          if (line.startsWith("model name") && !cpuModel) {
            cpuModel = line.split(":")[1]?.trim();
          }
          if (line.startsWith("processor")) {
            cpuCount = (cpuCount || 0) + 1;
          }
        }

        results.platform.cpu = {
          model: cpuModel,
          cores: cpuCount,
        };
        break;
      }

      case "": {
        // Extract total memory from /proc/meminfo
        const lines = output.split("\n");
        for (const line of lines) {
          if (line.startsWith("MemTotal:")) {
            const match = line.match(/MemTotal:\s+(\d+)\s+kB/);
            if (match) {
              // Convert kB to MB for readability
              const memKb = parseInt(match[1], 10);
              const memMb = Math.round(memKb / 1024);
              results.platform.memory = {
                total: `${memMb}M`,
              };
            }
            break;
          }
        }
        break;
      }

      case "virtualization": {
        results.platform.virtualization = output.trim() || "none";
        break;
      }

      case "blockDevices": {
        // Parse /proc/partitions for block device names (only main devices)
        const lines = output.split("\n").filter((line) => line.trim());
        const devices: string[] = [];

        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 4) {
            const device = parts[3]; // Device name is in the 4th column
            // Skip header line and partitions (names with numbers)
            if (device !== "name" && device && !/\d/.test(device)) {
              devices.push(device);
            }
          }
        }

        results.storage.blockDevices = devices;
        break;
      }

      case "mounts": {
        // Parse /proc/mounts for mount points
        const lines = output.split("\n").filter((line) => line.trim());
        const hostMounts: string[] = [];
        let dockerMounts = 0;

        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            const mountPoint = parts[1]; // Mount point is in the 2nd column
            const fsType = parts[2]; // Filesystem type is in the 3rd column

            // Filter out system, Docker and temporary mounts - keep only user-relevant mounts
            const isSystemMount = mountPoint.startsWith("/sys/") ||
              mountPoint.startsWith("/proc/") ||
              mountPoint.startsWith("/dev/") ||
              mountPoint === "/dev" ||
              mountPoint.startsWith("/run/") ||
              fsType === "proc" ||
              fsType === "sysfs" ||
              fsType === "devtmpfs" ||
              fsType === "devpts" ||
              fsType === "tmpfs" ||
              fsType === "cgroup" ||
              fsType === "cgroup2" ||
              fsType === "pstore" ||
              fsType === "bpf" ||
              fsType === "debugfs" ||
              fsType === "tracefs" ||
              fsType === "fusectl" ||
              fsType === "configfs" ||
              fsType === "hugetlbfs" ||
              fsType === "mqueue";

            const isDockerMount = fsType.includes("overlay") ||
              mountPoint.includes("/var/lib/docker") ||
              mountPoint.includes("/run/docker");

            const isSnapMount = mountPoint.includes("/snap/");

            if (!isSystemMount && !isDockerMount && !isSnapMount) {
              hostMounts.push(mountPoint);
            }

            // Count Docker-related mounts
            if (isDockerMount || fsType.includes("overlay")) {
              dockerMounts++;
            }
          }
        }

        results.storage.mounts = hostMounts;
        results.storage.dockerMounts = dockerMounts;
        break;
      }

      case "networkAddresses": {
        // Parse ifconfig output for network interfaces
        const interfaces: string[] = [];
        let dockerInterfaces = 0;

        // Split by interface blocks (each interface starts with interface name)
        const interfaceBlocks = output.split(/\n(?=\w)/);

        for (const block of interfaceBlocks) {
          const lines = block.split("\n").filter((line) => line.trim());
          if (lines.length === 0) continue;

          const interfaceName = lines[0].split(/\s+/)[0];

          // Skip Docker-related interfaces
          if (
            interfaceName.includes("docker") ||
            interfaceName.startsWith("br-") ||
            interfaceName.startsWith("veth")
          ) {
            dockerInterfaces++;
            continue;
          }

          // Extract IP address from inet line
          const inetLine = lines.find((line) => line.includes("inet "));
          if (inetLine) {
            const ipMatch = inetLine.match(/inet\s+([^\s]+)/);
            if (ipMatch) {
              interfaces.push(`${interfaceName} ${ipMatch[1]}`);
            }
          }
        }

        results.network.addresses = interfaces;
        results.network.dockerInterfaces = dockerInterfaces;
        break;
      }

      case "initSystem": {
        results.system.initSystem = output.trim() || "unknown";
        break;
      }

      case "serviceManager": {
        // Parse /proc/1/cmdline to detect service manager
        // cmdline is null-separated, convert to string and extract command name
        const cmdline = output.replace(/\0/g, " ").trim();
        const command = cmdline.split("/").pop()?.split(" ")[0] || "unknown";
        results.system.serviceManager = command;
        break;
      }

      case "firewallType": {
        results.system.firewallType = output.trim();
        break;
      }

      case "packageManager": {
        results.system.packageManager = output.trim();
        break;
      }

      case "containerRuntime": {
        results.system.containerRuntime = output.trim();
        break;
      }

      case "dnsConfig": {
        // Extract DNS servers from /etc/resolv.conf
        const lines = output.split("\n");
        const nameservers: string[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("nameserver ")) {
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
              nameservers.push(parts[1]);
            }
          }
        }

        results.network.dns = nameservers.length > 0 ? nameservers.join(" ") : "unknown";
        break;
      }

      case "firewall": {
        // Check if firewall rules exist
        results.security.firewall = !output.includes("No firewall");
        break;
      }

      case "securityModules": {
        // Check SELinux/AppArmor status
        results.security.selinux = !output.includes("No security");
        break;
      }

      case "currentTime": {
        results.time.current = output.trim() || "unknown";
        break;
      }

      case "timezone": {
        // date +%Z returns timezone directly
        results.time.timezone = output.trim() || "unknown";
        break;
      }

      case "awsMetadata": {
        results.cloud!.aws = !output.includes("Not AWS");
        break;
      }
      case "gcpMetadata": {
        results.cloud!.gcp = !output.includes("Not GCP");
        break;
      }
      case "azureMetadata": {
        results.cloud!.azure = !output.includes("Not Azure");
        break;
      }
    }
  }

  // Collect agent information
  results.agent.path = Deno.execPath();
  results.agent.pid = Deno.pid;

  log({ mod: "system-info", event: "collection_completed" });

  return results;
}
