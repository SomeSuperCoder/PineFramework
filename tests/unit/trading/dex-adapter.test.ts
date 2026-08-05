import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JupiterSwapAdapter } from '../../../src/trading/dex/jupiter-swap-adapter.js';
import { JupiterUltraAdapter } from '../../../src/trading/dex/jupiter-ultra-adapter.js';
import {
  getDexAdapter,
  registerDexAdapter,
  listDexAdapters,
  getDexAdapterInfo,
} from '../../../src/trading/dex/dex-registry.js';
import { DexAdapter } from '../../../src/trading/dex/dex-adapter.js';
import { openLongPosition, closeLongPosition } from '../../../src/trading/dex/spot-trading.js';
import type {
  Quote,
  SwapResult,
  TokenBalance,
  TxStatus,
} from '../../../src/trading/dex/dex-adapter.js';

// ---- DexAdapter Contract Tests ----

describe('DexAdapter contract', () => {
  it('JupiterSwapAdapter should have correct name and commission model', () => {
    const adapter = new JupiterSwapAdapter();
    expect(adapter.name).toBe('jupiter-swap');
    expect(adapter.commissionModel.name).toBe('jupiter-swap');
    expect(typeof adapter.commissionModel.feeBps).toBe('number');
    expect(adapter.slippageConfig.configurable).toBe(true);
  });

  it('JupiterUltraAdapter should have correct name and commission model', () => {
    const adapter = new JupiterUltraAdapter();
    expect(adapter.name).toBe('jupiter-ultra');
    expect(adapter.commissionModel.name).toBe('jupiter-ultra');
    expect(adapter.commissionModel.feeBps).toBe(5);
    expect(adapter.slippageConfig.configurable).toBe(true);
  });

  it('JupiterSwapAdapter quote should throw on API error', async () => {
    const adapter = new JupiterSwapAdapter('http://localhost:1'); // bad URL — connection refused
    await expect(
      adapter.quote(
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'So11111111111111111111111111111111111111112',
        BigInt(1000000),
        50,
      ),
    ).rejects.toThrow();
  }, 15000);

  it('JupiterSwapAdapter swap should handle failure gracefully', async () => {
    const adapter = new JupiterSwapAdapter('http://localhost:1');
    const result = await adapter.swap(
      {
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'So11111111111111111111111111111111111111112',
        inAmount: '1000000',
        outAmount: '500000',
        priceImpactPct: 0.1,
        route: 'direct',
        slippageBps: 50,
        feeBps: 0,
      },
      new Uint8Array(32),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('JupiterUltraAdapter swap should handle failure gracefully', async () => {
    const adapter = new JupiterUltraAdapter('http://localhost:1');
    const result = await adapter.swap(
      {
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'So11111111111111111111111111111111111111112',
        inAmount: '1000000',
        outAmount: '500000',
        priceImpactPct: 0.1,
        route: 'ultra',
        slippageBps: 30,
        feeBps: 5,
      },
      new Uint8Array(32),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('JupiterSwapAdapter should implement full DexAdapter interface', () => {
    const adapter = new JupiterSwapAdapter();
    expect(adapter).toBeInstanceOf(DexAdapter);
    expect(typeof adapter.quote).toBe('function');
    expect(typeof adapter.swap).toBe('function');
    expect(typeof adapter.getBalance).toBe('function');
    expect(typeof adapter.getTransactionStatus).toBe('function');
  });

  it('JupiterUltraAdapter should implement full DexAdapter interface', () => {
    const adapter = new JupiterUltraAdapter();
    expect(adapter).toBeInstanceOf(DexAdapter);
    expect(typeof adapter.quote).toBe('function');
    expect(typeof adapter.swap).toBe('function');
    expect(typeof adapter.getBalance).toBe('function');
    expect(typeof adapter.getTransactionStatus).toBe('function');
  });
});

// ---- DEX Registry Tests ----

describe('DEX Registry', () => {
  beforeEach(() => {
    // Reset registry by clearing and re-registering
    // Since registry is module-level, we test via the public API
  });

  it('should return default adapters', () => {
    const swap = getDexAdapter('jupiter-swap');
    expect(swap.name).toBe('jupiter-swap');

    const ultra = getDexAdapter('jupiter-ultra');
    expect(ultra.name).toBe('jupiter-ultra');
  });

  it('should list registered adapters', () => {
    const adapters = listDexAdapters();
    expect(adapters).toContain('jupiter-swap');
    expect(adapters).toContain('jupiter-ultra');
  });

  it('should throw for unknown DEX', () => {
    expect(() => getDexAdapter('unknown-dex' as never)).toThrow('Unknown DEX');
  });

  it('should allow registering a custom adapter', () => {
    const mockAdapter = {
      name: 'mock-dex',
      commissionModel: { name: 'mock', feeBps: 10, variable: false, description: 'mock' },
      slippageConfig: { bps: 100, configurable: false },
      quote: async () => ({
        inputMint: '',
        outputMint: '',
        inAmount: '0',
        outAmount: '0',
        priceImpactPct: 0,
        route: '',
        slippageBps: 100,
        feeBps: 10,
      }),
      swap: async () => ({ success: true, inputAmount: '0', outputAmount: '0', fee: '0' }),
      getBalance: async () => ({ mint: '', amount: '0', decimals: 6 }),
      getTransactionStatus: async () => 'confirmed' as TxStatus,
    } as DexAdapter;

    registerDexAdapter('jupiter-swap' as never, mockAdapter);
    const retrieved = getDexAdapter('jupiter-swap' as never);
    expect(retrieved.name).toBe('mock-dex');
  });

  it('should provide adapter info', () => {
    const info = getDexAdapterInfo();
    expect(info.length).toBeGreaterThanOrEqual(2);
    const swapInfo = info.find((i) => i.kind === 'jupiter-swap');
    expect(swapInfo).toBeDefined();
    expect(swapInfo!.commissionModel).toBeDefined();
  });
});

// ---- Spot Trading Tests ----

describe('Spot Trading', () => {
  const mockDex = {
    name: 'mock-dex',
    commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'mock' },
    slippageConfig: { bps: 50, configurable: true },
    quote: vi.fn(),
    swap: vi.fn(),
    getBalance: vi.fn(),
    getTransactionStatus: vi.fn(),
  } as unknown as DexAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('openLongPosition should succeed with sufficient balance', async () => {
    vi.mocked(mockDex.getBalance).mockResolvedValue({
      mint: 'USDC',
      amount: '10000000',
      decimals: 6,
    });
    vi.mocked(mockDex.quote).mockResolvedValue({
      inputMint: 'USDC_MINT',
      outputMint: 'ASSET_MINT',
      inAmount: '1000000',
      outAmount: '500000',
      priceImpactPct: 0.05,
      route: 'direct',
      slippageBps: 50,
      feeBps: 0,
    });
    vi.mocked(mockDex.swap).mockResolvedValue({
      success: true,
      signature: 'tx123',
      inputAmount: '1000000',
      outputAmount: '500000',
      fee: '0',
    });

    const result = await openLongPosition(mockDex, {
      assetMint: 'ASSET_MINT',
      amount: BigInt(1000000),
      slippageBps: 50,
      privateKey: new Uint8Array(32),
      publicKey: 'pubkey123',
    });

    expect(result.success).toBe(true);
    expect(result.signature).toBe('tx123');
    expect(mockDex.quote).toHaveBeenCalled();
    expect(mockDex.swap).toHaveBeenCalled();
  });

  it('openLongPosition should fail with insufficient balance', async () => {
    vi.mocked(mockDex.getBalance).mockResolvedValue({ mint: 'USDC', amount: '100', decimals: 6 });

    const result = await openLongPosition(mockDex, {
      assetMint: 'ASSET_MINT',
      amount: BigInt(1000000),
      slippageBps: 50,
      privateKey: new Uint8Array(32),
      publicKey: 'pubkey123',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient');
    expect(mockDex.quote).not.toHaveBeenCalled();
  });

  it('openLongPosition should fail with below minimum balance', async () => {
    vi.mocked(mockDex.getBalance).mockResolvedValue({
      mint: 'USDC',
      amount: '500000',
      decimals: 6,
    });

    const result = await openLongPosition(mockDex, {
      assetMint: 'ASSET_MINT',
      amount: BigInt(400000),
      slippageBps: 50,
      privateKey: new Uint8Array(32),
      publicKey: 'pubkey123',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('below minimum');
  });

  it('closeLongPosition should succeed with sufficient balance', async () => {
    vi.mocked(mockDex.getBalance).mockResolvedValue({
      mint: 'ASSET_MINT',
      amount: '500000',
      decimals: 9,
    });
    vi.mocked(mockDex.quote).mockResolvedValue({
      inputMint: 'ASSET_MINT',
      outputMint: 'USDC_MINT',
      inAmount: '500000',
      outAmount: '1000000',
      priceImpactPct: 0.05,
      route: 'direct',
      slippageBps: 50,
      feeBps: 0,
    });
    vi.mocked(mockDex.swap).mockResolvedValue({
      success: true,
      signature: 'tx456',
      inputAmount: '500000',
      outputAmount: '1000000',
      fee: '0',
    });

    const result = await closeLongPosition(mockDex, {
      assetMint: 'ASSET_MINT',
      amount: BigInt(500000),
      slippageBps: 50,
      privateKey: new Uint8Array(32),
      publicKey: 'pubkey123',
    });

    expect(result.success).toBe(true);
    expect(result.signature).toBe('tx456');
  });

  it('closeLongPosition should fail with insufficient asset balance', async () => {
    vi.mocked(mockDex.getBalance).mockResolvedValue({
      mint: 'ASSET_MINT',
      amount: '100',
      decimals: 9,
    });

    const result = await closeLongPosition(mockDex, {
      assetMint: 'ASSET_MINT',
      amount: BigInt(500000),
      slippageBps: 50,
      privateKey: new Uint8Array(32),
      publicKey: 'pubkey123',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient');
  });
});
