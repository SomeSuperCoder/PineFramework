import {
  PluginRegistry,
  DEFAULT_REGISTRY_CONFIG,
} from '../../src/extensibility/plugin-registry.js';
import type { Plugin, FunctionPlugin, PluginMetadata } from '../../src/extensibility/plugin-types.js';
import {
  createFunctionPlugin,
  createTypePlugin,
  createRendererPlugin,
} from '../../src/extensibility/plugin-manager.js';

function createTestPlugin(name: string, version: string = '1.0.0'): Plugin {
  return createFunctionPlugin(
    { name, version, description: `Test plugin ${name}`, author: 'test' },
    'test',
    `${name}Func`,
    { params: [], returnType: 'float', description: 'Test function' },
    () => 42,
  );
}

function createTestPluginWithDeps(name: string, deps: string[]): Plugin {
  return createFunctionPlugin(
    { name, version: '1.0.0', description: `Test plugin ${name}`, author: 'test', dependencies: deps },
    'test',
    `${name}Func`,
    { params: [], returnType: 'float', description: 'Test function' },
    () => 42,
  );
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry({}, '0.1.0');
  });

  describe('register', () => {
    it('should register a plugin', () => {
      const plugin = createTestPlugin('test1');
      const result = registry.register(plugin);

      expect(result).toBe(true);
      expect(registry.has('test1')).toBe(true);
      expect(registry.count()).toBe(1);
    });

    it('should not register duplicate plugin', () => {
      const config = { enableHotSwap: false };
      const reg = new PluginRegistry(config);

      const plugin1 = createTestPlugin('test1');
      const plugin2 = createTestPlugin('test1');

      reg.register(plugin1);
      expect(() => reg.register(plugin2)).toThrow('already registered');
    });

    it('should register plugin with hot swap', () => {
      const config = { enableHotSwap: true };
      const reg = new PluginRegistry(config);

      const plugin1 = createTestPlugin('test1');
      const plugin2 = createFunctionPlugin(
        { name: 'test1', version: '2.0.0', description: 'Updated', author: 'test' },
        'test',
        'test1Func',
        { params: [], returnType: 'float', description: 'Updated function' },
        () => 100,
      );

      reg.register(plugin1);
      reg.register(plugin2);

      expect(reg.count()).toBe(1);
      expect((reg.get('test1') as FunctionPlugin).implementation()).toBe(100);
    });

    it('should validate dependencies', () => {
      const plugin = createTestPluginWithDeps('test1', ['dep1']);

      expect(() => registry.register(plugin)).toThrow('requires dependency');
    });

    it('should register plugin with satisfied dependencies', () => {
      const dep = createTestPlugin('dep1');
      const plugin = createTestPluginWithDeps('test1', ['dep1']);

      registry.register(dep);
      registry.register(plugin);

      expect(registry.count()).toBe(2);
    });
  });

  describe('unregister', () => {
    it('should unregister a plugin', () => {
      const plugin = createTestPlugin('test1');
      registry.register(plugin);

      const result = registry.unregister('test1');
      expect(result).toBe(true);
      expect(registry.has('test1')).toBe(false);
    });

    it('should return false for non-existent plugin', () => {
      const result = registry.unregister('nonexistent');
      expect(result).toBe(false);
    });

    it('should deactivate plugin before unregistering', async () => {
      const plugin = createTestPlugin('test1');
      registry.register(plugin);
      await registry.activate('test1');

      registry.unregister('test1');
      expect(registry.isActive('test1')).toBe(false);
    });
  });

  describe('activate/deactivate', () => {
    it('should activate a plugin', async () => {
      const plugin = createTestPlugin('test1');
      registry.register(plugin);

      const result = await registry.activate('test1');
      expect(result).toBe(true);
      expect(registry.isActive('test1')).toBe(true);
    });

    it('should deactivate a plugin', async () => {
      const plugin = createTestPlugin('test1');
      registry.register(plugin);
      await registry.activate('test1');

      const result = await registry.deactivate('test1');
      expect(result).toBe(true);
      expect(registry.isActive('test1')).toBe(false);
    });

    it('should return false for non-existent plugin', async () => {
      const result = await registry.activate('nonexistent');
      expect(result).toBe(false);
    });

    it('should not activate already active plugin', async () => {
      const plugin = createTestPlugin('test1');
      registry.register(plugin);
      await registry.activate('test1');

      const result = await registry.activate('test1');
      expect(result).toBe(true);
    });
  });

  describe('activateAll/deactivateAll', () => {
    it('should activate all plugins', async () => {
      const plugin1 = createTestPlugin('test1');
      const plugin2 = createTestPlugin('test2');

      registry.register(plugin1);
      registry.register(plugin2);

      await registry.activateAll();

      expect(registry.isActive('test1')).toBe(true);
      expect(registry.isActive('test2')).toBe(true);
    });

    it('should deactivate all plugins', async () => {
      const plugin1 = createTestPlugin('test1');
      const plugin2 = createTestPlugin('test2');

      registry.register(plugin1);
      registry.register(plugin2);
      await registry.activateAll();

      await registry.deactivateAll();

      expect(registry.isActive('test1')).toBe(false);
      expect(registry.isActive('test2')).toBe(false);
    });
  });

  describe('get', () => {
    it('should get plugin by name', () => {
      const plugin = createTestPlugin('test1');
      registry.register(plugin);

      const retrieved = registry.get('test1');
      expect(retrieved).toBe(plugin);
    });

    it('should return undefined for non-existent plugin', () => {
      const retrieved = registry.get('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getByType', () => {
    it('should get plugins by type', () => {
      const funcPlugin = createTestPlugin('func1');
      const typePlugin = createTypePlugin(
        { name: 'type1', version: '1.0.0', description: 'Type plugin', author: 'test' },
        'MyType',
        { name: 'MyType', fields: [], description: 'Custom type' },
        {},
      );

      registry.register(funcPlugin);
      registry.register(typePlugin);

      const funcPlugins = registry.getByType('function');
      expect(funcPlugins.length).toBe(1);
      expect(funcPlugins[0]!.metadata.name).toBe('func1');

      const typePlugins = registry.getByType('type');
      expect(typePlugins.length).toBe(1);
      expect(typePlugins[0]!.metadata.name).toBe('type1');
    });
  });

  describe('getActive', () => {
    it('should get active plugins', async () => {
      const plugin1 = createTestPlugin('test1');
      const plugin2 = createTestPlugin('test2');

      registry.register(plugin1);
      registry.register(plugin2);
      await registry.activate('test1');

      const active = registry.getActive();
      expect(active.length).toBe(1);
      expect(active[0]!.metadata.name).toBe('test1');
    });
  });

  describe('getRegistered', () => {
    it('should get registered plugin names', () => {
      const plugin1 = createTestPlugin('test1');
      const plugin2 = createTestPlugin('test2');

      registry.register(plugin1);
      registry.register(plugin2);

      const registered = registry.getRegistered();
      expect(registered).toContain('test1');
      expect(registered).toContain('test2');
    });
  });

  describe('getDependencyGraph', () => {
    it('should return dependency graph', () => {
      const dep = createTestPlugin('dep1');
      const plugin = createTestPluginWithDeps('test1', ['dep1']);

      registry.register(dep);
      registry.register(plugin);

      const graph = registry.getDependencyGraph();
      expect(graph.get('test1')).toEqual(['dep1']);
      expect(graph.get('dep1')).toEqual([]);
    });
  });

  describe('getLoadOrder', () => {
    it('should return correct load order', () => {
      const config = { validateDependencies: false };
      const reg = new PluginRegistry(config);

      const dep = createTestPlugin('dep1');
      const plugin = createTestPluginWithDeps('test1', ['dep1']);

      reg.register(plugin);
      reg.register(dep);

      const order = reg.getLoadOrder();
      expect(order.indexOf('dep1')).toBeLessThan(order.indexOf('test1'));
    });
  });

  describe('clear', () => {
    it('should clear all plugins', async () => {
      const plugin1 = createTestPlugin('test1');
      const plugin2 = createTestPlugin('test2');

      registry.register(plugin1);
      registry.register(plugin2);
      await registry.activateAll();

      registry.clear();

      expect(registry.count()).toBe(0);
      expect(registry.getRegistered()).toEqual([]);
    });
  });
});
