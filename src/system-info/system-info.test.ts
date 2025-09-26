/**
 * SystemInfo class tests
 */

import { assertEquals } from "@std/assert";
import { SystemInfo } from "./system-info.ts";

Deno.test("SystemInfo.toMarkdown - empty system info", () => {
  const systemInfo = new SystemInfo();

  const result = systemInfo.toMarkdown();

  assertEquals(result, "");
});

Deno.test("SystemInfo.toMarkdown - identification only", () => {
  const systemInfo = new SystemInfo();
  systemInfo.identification = {
    hostname: "test-host",
    osRelease: "Ubuntu 22.04",
    kernel: "5.15.0",
    arch: "x86_64",
  };

  const result = systemInfo.toMarkdown();

  assertEquals(
    result,
    `Host: test-host
OS: Ubuntu 22.04
Kernel: 5.15.0
Architecture: x86_64`,
  );
});

Deno.test("SystemInfo.toMarkdown - platform info", () => {
  const systemInfo = new SystemInfo();
  systemInfo.platform = {
    cpu: {
      model: "Intel Xeon",
      cores: 8,
    },
    memory: {
      total: "16G",
    },
    virtualization: "kvm",
  };

  const result = systemInfo.toMarkdown();

  assertEquals(
    result,
    `CPU: Intel Xeon (8 cores)
Memory: 16G total
Virtualization: kvm`,
  );
});

Deno.test("SystemInfo.toMarkdown - storage info", () => {
  const systemInfo = new SystemInfo();
  systemInfo.storage = {
    blockDevices: ["sda", "sdb", "nvme0n1"],
    mounts: ["/", "/home", "/var"],
    dockerMounts: 5,
  };

  const result = systemInfo.toMarkdown();

  assertEquals(
    result,
    `Block devices: sda, sdb, nvme0n1
Mount points: /, /home, /var
Docker mounts: 5`,
  );
});

Deno.test("SystemInfo.toMarkdown - network info", () => {
  const systemInfo = new SystemInfo();
  systemInfo.network = {
    addresses: ["192.168.1.100", "10.0.0.50"],
    dns: "8.8.8.8",
    dockerInterfaces: 3,
    dockerPorts: 7,
  };

  const result = systemInfo.toMarkdown();

  assertEquals(
    result,
    `Network interfaces: 192.168.1.100, 10.0.0.50
DNS: 8.8.8.8
Docker interfaces: 3
Docker ports: 7`,
  );
});

Deno.test("SystemInfo.toMarkdown - system info", () => {
  const systemInfo = new SystemInfo();
  systemInfo.system = {
    initSystem: "systemd",
    serviceManager: "systemd",
    firewallType: "ufw",
    packageManager: "apt",
    containerRuntime: "docker",
  };

  const result = systemInfo.toMarkdown();

  assertEquals(
    result,
    `Init system: systemd
Service manager: systemd
Firewall: ufw
Package managers: apt
Container runtimes: docker`,
  );
});

Deno.test("SystemInfo.toMarkdown - agent info", () => {
  const systemInfo = new SystemInfo();
  systemInfo.agent = {
    path: "/usr/bin/deno",
    pid: 12345,
  };

  const result = systemInfo.toMarkdown();

  assertEquals(
    result,
    `Agent path: /usr/bin/deno
Agent PID: 12345`,
  );
});

Deno.test("SystemInfo.toMarkdown - security info", () => {
  const systemInfo = new SystemInfo();
  systemInfo.security = {
    firewall: true,
    selinux: false,
  };

  const result = systemInfo.toMarkdown();

  assertEquals(
    result,
    `Firewall status: configured
SELinux/AppArmor: none`,
  );
});

Deno.test("SystemInfo.toMarkdown - time and cloud info", () => {
  const systemInfo = new SystemInfo();
  systemInfo.time = {
    timezone: "Europe/Moscow",
  };
  systemInfo.cloud = {
    aws: true,
    gcp: false,
    azure: false,
  };

  const result = systemInfo.toMarkdown();

  assertEquals(
    result,
    `Timezone: Europe/Moscow
Cloud providers: AWS`,
  );
});

Deno.test("SystemInfo.toMarkdown - complete system info", () => {
  const systemInfo = new SystemInfo();

  // Fill all sections
  systemInfo.identification = {
    hostname: "server.example.com",
    osRelease: "Ubuntu 22.04 LTS",
    kernel: "5.15.0-41-generic",
    arch: "x86_64",
  };

  systemInfo.platform = {
    cpu: {
      model: "Intel Xeon E5-2680",
      cores: 16,
    },
    memory: {
      total: "64G",
    },
    virtualization: "kvm",
  };

  systemInfo.storage = {
    blockDevices: ["sda", "sdb"],
    mounts: ["/", "/home", "/var", "/tmp"],
    dockerMounts: 2,
  };

  systemInfo.network = {
    addresses: ["192.168.1.10", "10.0.0.10"],
    dns: "8.8.8.8 8.8.4.4",
    dockerInterfaces: 1,
    dockerPorts: 3,
  };

  systemInfo.system = {
    initSystem: "systemd",
    serviceManager: "systemd",
    firewallType: "ufw",
    packageManager: "apt",
    containerRuntime: "docker",
  };

  systemInfo.agent = {
    path: "/usr/local/bin/deno",
    pid: 98765,
  };

  systemInfo.security = {
    firewall: true,
    selinux: false,
  };

  systemInfo.time = {
    timezone: "UTC",
  };

  systemInfo.cloud = {
    aws: true,
    gcp: false,
    azure: false,
  };

  const result = systemInfo.toMarkdown();

  const expected = `Host: server.example.com
OS: Ubuntu 22.04 LTS
Kernel: 5.15.0-41-generic
Architecture: x86_64
CPU: Intel Xeon E5-2680 (16 cores)
Memory: 64G total
Virtualization: kvm
Block devices: sda, sdb
Mount points: /, /home, /var, /tmp
Docker mounts: 2
Network interfaces: 192.168.1.10, 10.0.0.10
DNS: 8.8.8.8 8.8.4.4
Docker interfaces: 1
Docker ports: 3
Init system: systemd
Service manager: systemd
Firewall: ufw
Package managers: apt
Container runtimes: docker
Timezone: UTC
Cloud providers: AWS
Agent path: /usr/local/bin/deno
Agent PID: 98765
Firewall status: configured
SELinux/AppArmor: none`;

  assertEquals(result, expected);
});

Deno.test("SystemInfo.toMarkdown - partial data", () => {
  const systemInfo = new SystemInfo();

  // Only some fields filled
  systemInfo.identification.hostname = "test";
  systemInfo.platform.cpu = { model: "Test CPU", cores: 4 };
  systemInfo.system.initSystem = "init";
  systemInfo.agent.pid = 42;

  const result = systemInfo.toMarkdown();

  const expected = `Host: test
CPU: Test CPU (4 cores)
Init system: init
Agent PID: 42`;

  assertEquals(result, expected);
});
