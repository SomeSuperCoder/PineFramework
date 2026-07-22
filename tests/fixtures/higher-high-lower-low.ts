/**
 * Loads the Higher High Lower Low Pine Script source from disk.
 *
 * Contains 9 `alertcondition()` calls covering various HH/HL/LH/LL label
 * combinations. Uses `ta.pivothigh`/`ta.pivotlow` with configurable lookback.
 *
 * Condition titles:
 *   "Any structure label (HH/HL/LH/LL)", "First LL after HL/HH",
 *   "First HH after LL/LH", "LL or HL formed", "LH or HH formed",
 *   "HL formed", "HH formed", "LL formed", "LH formed"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const HHLL_SOURCE: string = fs.readFileSync(
  path.resolve(__dirname, '../../test_indicators/higher-high-lower-low.pine'),
  'utf-8',
);

export const HHLL_ALERT_COUNT = 9;
export const HHLL_CONDITION_TITLES = [
  'Any structure label (HH/HL/LH/LL)',
  'First LL after HL/HH',
  'First HH after LL/LH',
  'LL or HL formed',
  'LH or HH formed',
  'HL formed',
  'HH formed',
  'LL formed',
  'LH formed',
] as const;
