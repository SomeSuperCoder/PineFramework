import type {
  Plugin,
  PluginMetadata,
  PluginType,
} from './plugin-types.js';

export interface PluginRegistryConfig {
  maxPlugins: number;
  enableHotSwap: boolean;
  validateDependencies: boolean;
  checkVersionCompatibility: boolean;
}

export const DEFAULT_REGISTRY_CONFIG: PluginRegistryConfig = {
  maxPlugins: 100,
  enableHotSwap: true,
  validateDependencies: true,
  checkVersionCompatibility: true,
};

export interface PluginDependency {
  name: string;
  version: string;
  optional: boolean;
}

export interface PluginEntry {
  plugin: Plugin;
  registeredAt: number;
  activatedAt?: number;
  deactivatdAt?: number;
  isActive: boolean;
}

export class PluginRegistry {
  private plugins: Map<string, PluginEntry>;
  private config: PluginRegistryConfig;
  private engineVersion: string;

  constructor(config: Partial<PluginRegistryConfig> = {}, engineVersion: string = '0.1.0') {
    this.plugins = new Map();
    this.config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
    this.engineVersion = engineVersion;
  }

  register(plugin: Plugin): boolean {
    if (this.plugins.size >= this.config.maxPlugins) {
      throw new Error(`Maximum plugin limit (${this.config.maxPlugins}) reached`);
    }

    const name = plugin.metadata.name;

    if (this.plugins.has(name)) {
      if (this.config.enableHotSwap) {
        this.unregister(name);
      } else {
        throw new Error(`Plugin '${name}' is already registered`);
      }
    }

    if (this.config.checkVersionCompatibility && !plugin.isCompatible(this.engineVersion)) {
      throw new Error(
        `Plugin '${name}' v${plugin.metadata.version} is not compatible with engine v${this.engineVersion}`,
      );
    }

    if (this.config.validateDependencies) {
      this.validateDependencies(plugin.metadata);
    }

    const entry: PluginEntry = {
      plugin,
      registeredAt: Date.now(),
      isActive: false,
    };

    this.plugins.set(name, entry);
    return true;
  }

  unregister(name: string): boolean {
    const entry = this.plugins.get(name);
    if (!entry) return false;

    if (entry.isActive) {
      entry.plugin.deactivate();
      entry.isActive = false;
      entry.deactivatdAt = Date.now();
    }

    this.plugins.delete(name);
    return true;
  }

  async activate(name: string): Promise<boolean> {
    const entry = this.plugins.get(name);
    if (!entry) return false;

    if (entry.isActive) return true;

    await entry.plugin.activate();
    entry.isActive = true;
    entry.activatedAt = Date.now();
    return true;
  }

  async deactivate(name: string): Promise<boolean> {
    const entry = this.plugins.get(name);
    if (!entry) return false;

    if (!entry.isActive) return true;

    await entry.plugin.deactivate();
    entry.isActive = false;
    entry.deactivatdAt = Date.now();
    return true;
  }

  async activateAll(): Promise<void> {
    for (const [name, entry] of this.plugins) {
      if (!entry.isActive) {
        await this.activate(name);
      }
    }
  }

  async deactivateAll(): Promise<void> {
    for (const [name, entry] of this.plugins) {
      if (entry.isActive) {
        await this.deactivate(name);
      }
    }
  }

  get(name: string): Plugin | undefined {
    return this.plugins.get(name)?.plugin;
  }

  getEntry(name: string): PluginEntry | undefined {
    return this.plugins.get(name);
  }

  getByType(type: PluginType): Plugin[] {
    return Array.from(this.plugins.values())
      .filter((entry) => entry.plugin.type === type)
      .map((entry) => entry.plugin);
  }

  getActive(): Plugin[] {
    return Array.from(this.plugins.values())
      .filter((entry) => entry.isActive)
      .map((entry) => entry.plugin);
  }

  getRegistered(): string[] {
    return Array.from(this.plugins.keys());
  }

  has(name: string): boolean {
    return this.plugins.has(name);
  }

  isActive(name: string): boolean {
    return this.plugins.get(name)?.isActive ?? false;
  }

  count(): number {
    return this.plugins.size;
  }

  private validateDependencies(metadata: PluginMetadata): void {
    if (!metadata.dependencies) return;

    for (const dep of metadata.dependencies) {
      if (!this.plugins.has(dep)) {
        throw new Error(`Plugin '${metadata.name}' requires dependency '${dep}' which is not registered`);
      }
    }
  }

  getDependencyGraph(): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const [name, entry] of this.plugins) {
      graph.set(name, entry.plugin.metadata.dependencies ?? []);
    }

    return graph;
  }

  getLoadOrder(): string[] {
    const graph = this.getDependencyGraph();
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);

      const deps = graph.get(name) ?? [];
      for (const dep of deps) {
        visit(dep);
      }

      order.push(name);
    };

    for (const name of graph.keys()) {
      visit(name);
    }

    return order;
  }

  clear(): void {
    for (const entry of this.plugins.values()) {
      if (entry.isActive) {
        entry.plugin.deactivate();
      }
    }
    this.plugins.clear();
  }
}
