import type { Plugin, PluginMetadata, FunctionPlugin, TypePlugin, RendererPlugin, DataSourcePlugin } from './plugin-types.js';
import { PluginRegistry, type PluginRegistryConfig } from './plugin-registry.js';

export class PluginManager {
  private registry: PluginRegistry;
  private plugins: Map<string, Plugin>;

  constructor(config: Partial<PluginRegistryConfig> = {}, engineVersion: string = '0.1.0') {
    this.registry = new PluginRegistry(config, engineVersion);
    this.plugins = new Map();
  }

  async loadPlugin(plugin: Plugin): Promise<boolean> {
    try {
      this.registry.register(plugin);
      this.plugins.set(plugin.metadata.name, plugin);
      await this.registry.activate(plugin.metadata.name);
      return true;
    } catch (error) {
      console.error(`Failed to load plugin '${plugin.metadata.name}':`, error);
      return false;
    }
  }

  async unloadPlugin(name: string): Promise<boolean> {
    try {
      await this.registry.deactivate(name);
      this.registry.unregister(name);
      this.plugins.delete(name);
      return true;
    } catch (error) {
      console.error(`Failed to unload plugin '${name}':`, error);
      return false;
    }
  }

  getPlugin(name: string): Plugin | undefined {
    return this.registry.get(name);
  }

  getPluginsByType(type: Plugin['type']): Plugin[] {
    return this.registry.getByType(type);
  }

  getActivePlugins(): Plugin[] {
    return this.registry.getActive();
  }

  isPluginLoaded(name: string): boolean {
    return this.registry.has(name);
  }

  isPluginActive(name: string): boolean {
    return this.registry.isActive(name);
  }

  getRegistry(): PluginRegistry {
    return this.registry;
  }

  getPluginCount(): number {
    return this.registry.count();
  }

  async reloadPlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;

    await this.unloadPlugin(name);
    return this.loadPlugin(plugin);
  }

  async reloadAll(): Promise<void> {
    const plugins = Array.from(this.plugins.values());
    for (const plugin of plugins) {
      await this.reloadPlugin(plugin.metadata.name);
    }
  }
}

export function createFunctionPlugin(
  metadata: PluginMetadata,
  namespace: string,
  name: string,
  signature: FunctionPlugin['signature'],
  implementation: FunctionPlugin['implementation'],
): FunctionPlugin {
  return {
    metadata,
    type: 'function',
    namespace,
    name,
    signature,
    implementation,
    activate() {},
    deactivate() {},
    isCompatible(_engineVersion: string) {
      return true;
    },
  };
}

export function createTypePlugin(
  metadata: PluginMetadata,
  typeName: string,
  typeDefinition: TypePlugin['typeDefinition'],
  operations: TypePlugin['operations'],
): TypePlugin {
  return {
    metadata,
    type: 'type',
    typeName,
    typeDefinition,
    operations,
    activate() {},
    deactivate() {},
    isCompatible(_engineVersion: string) {
      return true;
    },
  };
}

export function createRendererPlugin(
  metadata: PluginMetadata,
  renderType: string,
  renderFunction: RendererPlugin['renderFunction'],
): RendererPlugin {
  return {
    metadata,
    type: 'renderer',
    renderType,
    renderFunction,
    activate() {},
    deactivate() {},
    isCompatible(_engineVersion: string) {
      return true;
    },
  };
}

export function createDataSourcePlugin(
  metadata: PluginMetadata,
  sourceType: string,
  fetch: DataSourcePlugin['fetch'],
  subscribe?: DataSourcePlugin['subscribe'],
  unsubscribe?: DataSourcePlugin['unsubscribe'],
): DataSourcePlugin {
  return {
    metadata,
    type: 'datasource',
    sourceType,
    fetch,
    subscribe,
    unsubscribe,
    activate() {},
    deactivate() {},
    isCompatible(_engineVersion: string) {
      return true;
    },
  };
}
