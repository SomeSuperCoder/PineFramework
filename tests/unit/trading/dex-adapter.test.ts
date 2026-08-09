import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JupiterSwapAdapter } from '../../../src/trading/dex/jupiter-swap-adapter.js';
import { JupiterUltraAdapter } from '../../../src/trading/dex/jupiter-ultra-adapter.js';
import {
  getDexAdapter,
  registerDexAdapter,
  listDexAdapters,
  getDexAdapterInfo,
} from '../../../src/trading/dex/dex-registry.js';
import { DexAdapter, captureSwapFeeComponents } from '../../../src/trading/dex/dex-adapter.js';
import { openLongPosition, closeLongPosition } from '../../../src/trading/dex/spot-trading.js';
import { USDC_MINT } from '../../../src/trading/token-registry.js';
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
    // M4: no fixed rate is assumed — fees are observed from the API at
    // execution (captureSwapFeeComponents), so the commission model carries 0.
    expect(adapter.commissionModel.feeBps).toBe(0);
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
      swap: async () => ({ success: true, inputAmount: '0', outputAmount: '0', feeComponents: [] }),
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
      // M9: the adapter never fabricates fee '0' — no fee claim at all.
      feeComponents: [],
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
    // SpotTradeResult.fee is OPTIONAL — omitted when the swap carried no fee.
    expect(result.fee).toBeUndefined();
    expect(mockDex.quote).toHaveBeenCalled();
    expect(mockDex.swap).toHaveBeenCalled();
  });

  it("openLongPosition forwards an OBSERVED input-token fee (never '0' fabrication)", async () => {
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
      signature: 'tx-fee',
      inputAmount: '1000000',
      outputAmount: '500000',
      fee: '2500',
      feeComponents: [],
    });

    const result = await openLongPosition(mockDex, {
      assetMint: 'ASSET_MINT',
      amount: BigInt(1000000),
      slippageBps: 50,
      privateKey: new Uint8Array(32),
      publicKey: 'pubkey123',
    });

    expect(result.success).toBe(true);
    // The observed fee is forwarded verbatim (present because observed, not '0').
    expect(result.fee).toBe('2500');
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
      // M9: no fabricated fee — omitted entirely.
      feeComponents: [],
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
    // SpotTradeResult.fee is OPTIONAL — omitted when the swap carried no fee.
    expect(result.fee).toBeUndefined();
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

// ---- captureSwapFeeComponents — Security-F2 sanitization (M9) ----

describe('captureSwapFeeComponents — sanitization (mint whitelist + amount clamps)', () => {
  // The canonical USDC input-mint swap context shared by the cases below.
  const SWAP_CTX = {
    routePlan: undefined,
    platformFee: undefined,
    prioritizationFeeLamports: undefined,
    inputMint: USDC_MINT,
    outputMint: 'ASSET_MINT',
    inAmount: '1000000',
    outAmount: '5000000',
  };

  /** The protocol BASE component that is ALWAYS recorded (2 × 5_000 lamports SOL). */
  const BASE_ONLY = [{ kind: 'BASE', tokenMint: 'SOL', amountAtomic: '10000' }];

  it('keeps a valid input-mint VENUE within the swap size; feeUnknown false; legacy fee set', () => {
    const result = captureSwapFeeComponents({
      ...SWAP_CTX,
      routePlan: [
        {
          swapInfo: {
            ammKey: 'amm1',
            label: 'Orca',
            inputMint: USDC_MINT,
            outputMint: 'ASSET_MINT',
            inAmount: '1000000',
            outAmount: '5000000',
            feeAmount: '250000',
            feeMint: USDC_MINT,
          },
          percent: 100,
          bps: 10000,
        },
      ],
    });

    expect(result.components).toEqual([
      { kind: 'VENUE', tokenMint: USDC_MINT, amountAtomic: '250000' },
      ...BASE_ONLY,
    ]);
    expect(result.feeUnknown).toBe(false);
    // input-token VENUE observed → legacy display fee present (never '0').
    expect(result.inputTokenFee).toBe('250000');
  });

  it('drops an absurd input-mint fee (fee > inAmount) and flags feeUnknown', () => {
    const result = captureSwapFeeComponents({
      ...SWAP_CTX,
      routePlan: [
        {
          swapInfo: {
            ammKey: 'amm1',
            label: 'Orca',
            inputMint: USDC_MINT,
            outputMint: 'ASSET_MINT',
            inAmount: '1000000',
            outAmount: '5000000',
            // > 1_000_000 inAmount — a corrupt/absurd response.
            feeAmount: '99999999999999999999',
            feeMint: USDC_MINT,
          },
          percent: 100,
          bps: 10000,
        },
      ],
    });

    // The absurd VENUE is dropped — only the protocol BASE remains.
    expect(result.components).toEqual(BASE_ONLY);
    expect(result.feeUnknown).toBe(true);
    expect(result.inputTokenFee).toBeUndefined();
  });

  it('drops an unknown/foreign fee mint (whitelist) and flags feeUnknown', () => {
    const result = captureSwapFeeComponents({
      ...SWAP_CTX,
      routePlan: [
        {
          swapInfo: {
            ammKey: 'amm1',
            label: 'Orca',
            inputMint: USDC_MINT,
            outputMint: 'ASSET_MINT',
            inAmount: '1000000',
            outAmount: '5000000',
            feeAmount: '5000',
            feeMint: 'FakeMint1111111111111111111111111111111111',
          },
          percent: 100,
          bps: 10000,
        },
      ],
    });

    // A raw foreign address never flows into PnL — dropped.
    expect(result.components).toEqual(BASE_ONLY);
    expect(result.feeUnknown).toBe(true);
    expect(result.inputTokenFee).toBeUndefined();
  });

  it('clamps an output-mint fee to the output amount (fee > outAmount is dropped)', () => {
    const result = captureSwapFeeComponents({
      ...SWAP_CTX,
      routePlan: [
        {
          swapInfo: {
            ammKey: 'amm1',
            label: 'Orca',
            inputMint: USDC_MINT,
            outputMint: 'ASSET_MINT',
            inAmount: '1000000',
            outAmount: '5000000',
            feeAmount: '999999999999',
            feeMint: 'ASSET_MINT',
          },
          percent: 100,
          bps: 10000,
        },
      ],
    });

    expect(result.components).toEqual(BASE_ONLY);
    expect(result.feeUnknown).toBe(true);
  });

  it('caps SOL-side lamport fees at 10 SOL when SOL is on neither side of the swap', () => {
    // USDC → ASSET (no SOL on either side): a 20 SOL priority fee is absurd.
    const result = captureSwapFeeComponents({
      ...SWAP_CTX,
      prioritizationFeeLamports: '20000000000',
    });

    expect(result.components).toEqual(BASE_ONLY);
    expect(result.feeUnknown).toBe(true);
  });
});
