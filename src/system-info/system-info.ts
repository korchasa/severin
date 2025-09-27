/**
 * System information types and interfaces
 */

export class SystemInfo {
  identification: {
    hostname?: string;
    osRelease?: string;
    kernel?: string;
    arch?: string;
  } = {};

  platform: {
    cpu?: {
      model?: string;
      cores?: number;
    };
    memory?: {
      total?: string;
    };
    virtualization?: string;
  } = {};

  storage: {
    blockDevices?: string[];
    mounts?: string[];
    dockerMounts?: number;
  } = {};

  network: {
    addresses?: string[];
    dns?: string;
    dockerInterfaces?: number;
    dockerPorts?: number;
  } = {};

  system: {
    initSystem?: string;
    serviceManager?: string;
    firewallType?: string;
    packageManager?: string;
    containerRuntime?: string;
  } = {};

  agent: {
    path?: string;
    pid?: number;
  } = {};

  security: {
    firewall?: boolean;
    selinux?: boolean;
  } = {};

  time: {
    current?: string;
    timezone?: string;
  } = {};

  cloud?: {
    aws?: boolean;
    gcp?: boolean;
    azure?: boolean;
  } = {};

  /**
   * Formats system information into markdown for use in prompts and console output
   */
  toMarkdown(): string {
    const sections: string[] = [];

    // Identification and OS
    if (this.identification.hostname) sections.push(`- Host: ${this.identification.hostname}`);
    if (this.identification.osRelease) sections.push(`- OS: ${this.identification.osRelease}`);
    if (this.identification.kernel) sections.push(`- Kernel: ${this.identification.kernel}`);
    if (this.identification.arch) sections.push(`- Architecture: ${this.identification.arch}`);

    // Hardware platform
    if (this.platform.cpu) {
      const cpuInfo = this.platform.cpu.model && this.platform.cpu.cores
        ? `${this.platform.cpu.model} (${this.platform.cpu.cores} cores)`
        : this.platform.cpu.model || "unknown";
      sections.push(`- CPU: ${cpuInfo}`);
    }
    if (this.platform.memory) {
      sections.push(`- Memory: ${this.platform.memory.total} total`);
    }
    if (this.platform.virtualization && this.platform.virtualization !== "none") {
      sections.push(`- Virtualization: ${this.platform.virtualization}`);
    }

    // Storage
    if (this.storage.blockDevices && this.storage.blockDevices.length > 0) {
      sections.push(`- Block devices: ${this.storage.blockDevices.join(", ")}`);
    }
    if (this.storage.mounts && this.storage.mounts.length > 0) {
      sections.push(`- Mount points: ${this.storage.mounts.join(", ")}`);
    }
    if (this.storage.dockerMounts && this.storage.dockerMounts > 0) {
      sections.push(`- Docker mounts: ${this.storage.dockerMounts}`);
    }

    // Network
    if (this.network.addresses && this.network.addresses.length > 0) {
      sections.push(`- Network interfaces: ${this.network.addresses.join(", ")}`);
    }
    if (this.network.dns) sections.push(`- DNS: ${this.network.dns}`);
    if (this.network.dockerInterfaces && this.network.dockerInterfaces > 0) {
      sections.push(`- Docker interfaces: ${this.network.dockerInterfaces}`);
    }
    if (this.network.dockerPorts && this.network.dockerPorts > 0) {
      sections.push(`- Docker ports: ${this.network.dockerPorts}`);
    }

    // System
    if (this.system.initSystem) sections.push(`- Init system: ${this.system.initSystem}`);
    if (this.system.serviceManager) {
      sections.push(`- Service manager: ${this.system.serviceManager}`);
    }
    if (this.system.firewallType) sections.push(`- Firewall: ${this.system.firewallType}`);
    if (this.system.packageManager) {
      sections.push(`- Package managers: ${this.system.packageManager}`);
    }
    if (this.system.containerRuntime) {
      sections.push(`- Container runtimes: ${this.system.containerRuntime}`);
    }

    // Cloud
    const cloudProviders: string[] = [];
    if (this.cloud?.aws) cloudProviders.push("AWS");
    if (this.cloud?.gcp) cloudProviders.push("GCP");
    if (this.cloud?.azure) cloudProviders.push("Azure");
    if (cloudProviders.length > 0) {
      sections.push(`- Cloud providers: ${cloudProviders.join(", ")}`);
    }

    // Agent
    if (this.agent.path) sections.push(`- Agent path: ${this.agent.path}`);
    if (this.agent.pid) sections.push(`- Agent PID: ${this.agent.pid}`);

    // Security
    if (this.security.firewall !== undefined) {
      sections.push(`- Firewall status: ${this.security.firewall ? "configured" : "none"}`);
    }
    if (this.security.selinux !== undefined) {
      sections.push(`- SELinux/AppArmor: ${this.security.selinux ? "active" : "none"}`);
    }

    // Time
    if (this.time.timezone) sections.push(`- Timezone: ${this.time.timezone}`);
    if (this.time.current) sections.push(`- Current time: ${this.time.current}`);

    return sections.length > 0 ? sections.join("\n") : "";
  }
}
