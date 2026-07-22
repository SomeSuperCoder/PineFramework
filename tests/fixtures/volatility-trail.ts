/**
 * Loads the Volatility Trail [BOSWaves] Pine Script source from disk.
 *
 * Contains 4 `alertcondition()` calls:
 *   1. "Trail Long"   — fires on flipUp (trend changes from down to up)
 *   2. "Trail Short"  — fires on flipDn (trend changes from up to down)
 *   3. "Bull Retest"  — fires on bullRTok (dip to trail in uptrend)
 *   4. "Bear Retest"  — fires on bearRTok (bounce off trail in downtrend)
 *
 * Also renders visual markers for cross-validation:
 *   - "▲" labels on flipUp, "▼" labels on flipDn
 *   - "◆" plotchar on bullRTok / bearRTok
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const VOLATILITY_TRAIL_SOURCE: string = fs.readFileSync(
  path.resolve(__dirname, '../../test_indicators/volatility-trail.pine'),
  'utf-8',
);

export const VOLATILITY_TRAIL_ALERT_COUNT = 4;
export const VOLATILITY_TRAIL_CONDITION_TITLES = [
  'Trail Long',
  'Trail Short',
  'Bull Retest',
  'Bear Retest',
] as const;
