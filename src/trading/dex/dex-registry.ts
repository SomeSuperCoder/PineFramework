/**
 * DEX Registry — manages available DEX adapters and provides selection.
 *
 * @module trading
 */

import { DexAdapter } from './dex-adapter.js';
import type { DexKind } from '../types.js';
import { JupiterSwapAdapter } from './jupiter-swap-adapter.js';
import { JupiterUltraAdapter } from './jupiter-ultra-adapter.js';

/** Mapping from DexKind to adapter instances. */
const registry = new Map<DexKind, DexAdapter>();

/** Initialize default adapters. */
function ensureDefaults(): void {
  if (registry.size === 0) {
    registry.set('jupiter-swap', new JupiterSwapAdapter());
    registry.set('jupiter-ultra', new JupiterUltraAdapter());
  }
}

/**
 * Get a DEX adapter by kind.
 */
export function getDexAdapter(kind: DexKind): DexAdapter {
  ensureDefaults();
  const adapter = registry.get(kind);
  if (!adapter) {
    throw new Error(`Unknown DEX: ${kind}. Available: ${listDexAdapters().join(', ')}`);
  }
  return adapter;
}

/**
 * Register a custom DEX adapter.
 */
export function registerDexAdapter(kind: DexKind, adapter: DexAdapter): void {
  registry.set(kind, adapter);
}

/**
 * List all registered DEX adapter kinds.
 */
export function listDexAdapters(): DexKind[] {
  ensureDefaults();
  return Array.from(registry.keys());
}

/**
 * Get all registered DEX adapters with their info.
 */
export function getDexAdapterInfo(): Array<{
  kind: DexKind;
  name: string;
  commissionModel: { name: string; feeBps: number; description: string };
  slippageBps: number;
}> {
  ensureDefaults();
  return Array.from(registry.entries()).map(([kind, adapter]) => ({
    kind,
    name: adapter.name,
    commissionModel: {
      name: adapter.commissionModel.name,
      feeBps: adapter.commissionModel.feeBps,
      description: adapter.commissionModel.description,
    },
    slippageBps: adapter.slippageConfig.bps,
  }));
}
