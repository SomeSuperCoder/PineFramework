export { DexAdapter } from './dex-adapter.js';
export type {
  Quote,
  SwapResult,
  TokenBalance,
  TxStatus,
  CommissionModel,
  SlippageConfig,
} from './dex-adapter.js';

export { JupiterSwapAdapter } from './jupiter-swap-adapter.js';
export { JupiterUltraAdapter } from './jupiter-ultra-adapter.js';
export {
  getDexAdapter,
  registerDexAdapter,
  listDexAdapters,
  getDexAdapterInfo,
} from './dex-registry.js';

export { openLongPosition, closeLongPosition, USDC_MINT } from './spot-trading.js';
export type { SpotTradeParams, SpotTradeResult } from './spot-trading.js';
