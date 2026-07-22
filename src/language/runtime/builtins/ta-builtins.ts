/**
 * Legacy entry point — delegates to the domain-split TA builtin registration
 * functions.  Imported by existing code as `registerTaBuiltins(engine)`.
 *
 * New code should import the specific registration function it needs from the
 * individual domain modules under `ta/`.
 */
import type { ExecutionEngine } from '../execution-engine.js';
import { registerTaOverlap } from './ta/ta-overlap.js';
import { registerTaMomentum } from './ta/ta-momentum.js';
import { registerTaVolatility } from './ta/ta-volatility.js';
import { registerTaStatistics } from './ta/ta-statistics.js';

export function registerTaBuiltins(engine: ExecutionEngine): void {
  registerTaOverlap(engine);
  registerTaMomentum(engine);
  registerTaVolatility(engine);
  registerTaStatistics(engine);
}
