import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ScriptSession, type ScriptOutputs } from '../src/session/ScriptSession.js';
import { createExecuteRouter } from '../src/routes/execute.js';
import { InMemoryCancellationRegistry } from '../src/cancellation-registry.js';
import { createPineScriptEngine } from 'pine-framework';
import {
  normalizeExecutionResultMessage,
  type ExecutionResultMessageInput,
} from 'pine-framework/contracts';

/**
 * F3 SERIALIZER PARITY GUARDRAILS (shared execution-result contract refactor).
 *
 * The Director's requirement: "everything was passed even if empty so WS and
 * REST never drop the data of the other one." B2/B3 migrated BOTH wire paths to
 * build from the shared contract (pine-framework/contracts) with normalize()
 * as the backstop. These tests feed the SAME script + bars through the REST
 * mapper (routes/execute.ts, real express route) and the WS serializers
 * (FormingCandleManager.toOutputs / toFormingCandleOutputs via ScriptSession)
 * and assert:
 *   1. The REQUIRED key set (17 collections + isConfirmed) is IDENTICAL across
 *      REST + WS full + WS diff — collections present and never undefined (the
 *      "even if empty" guarantee).
 *   2. No unknown keys on any wire (everything present is a contract key).
 *   3. isConfirmed true on REST+full, false on diff.
 *   4. 8th-gap regression: WS diff alertConditions is NEVER undefined.
 *   5. boxes+tables-on-diff regression: WS diff carries them as [] (the keys
 *      were MISSING entirely pre-B2).
 *   6. In-memory contract guarantee: normalize emits the FULL key set
 *      (including undefined-valued optional scalars) — JSON wires drop
 *      undefined values by construction, so the parity guardrail compares the
 *      REQUIRED surface (data), and normalize unit tests cover the full set.
 */

// ── Contract key surface (mirrors src/contracts/index.ts — ExecutionResultPayloadFields) ──
const CONTRACT_COLLECTION_KEYS = [
  'outputs', 'plotColors', 'fillColorData', 'hiddenPlotKeys', 'plotOverlayKeys',
  'shapes', 'fills', 'linefills', 'bgcolor', 'barColors', 'strategyMarkers',
  'lines', 'labels', 'boxes', 'tables', 'alertConditions', 'alertTriggers',
];
const MAP_COLLECTION_KEYS = ['outputs', 'plotColors', 'fillColorData'];
const ARRAY_COLLECTION_KEYS = CONTRACT_COLLECTION_KEYS.filter((k) => !MAP_COLLECTION_KEYS.includes(k));
const CONTRACT_PAYLOAD_KEYS = [
  'success', 'error', 'version', 'overlay', 'indicatorId',
  ...CONTRACT_COLLECTION_KEYS,
  'barTimestamps', 'barIndex', 'formingCandle', 'maxLookback', 'isConfirmed',
];
// The REQUIRED data surface — the 17 collections + the discriminant. Optional
// scalars (error/indicatorId/barIndex/formingCandle/barTimestamps/maxLookback)
// may be absent on a JSON wire when undefined, by construction of JSON.
const REQUIRED_KEY_SET = [...CONTRACT_COLLECTION_KEYS, 'isConfirmed'];

/** Assert the contract shape of any wire payload: required key set + no unknowns. */
function assertContractShape(payload: Record<string, unknown>, label: string): void {
  for (const k of REQUIRED_KEY_SET) {
    expect(k in payload, `${label}: REQUIRED key "${k}" must be present (never dropped)`).toBe(true);
  }
  for (const k of ARRAY_COLLECTION_KEYS) {
    expect(Array.isArray(payload[k]), `${label}: ${k} must be an array (never undefined)`).toBe(true);
  }
  for (const k of MAP_COLLECTION_KEYS) {
    expect(typeof payload[k], `${label}: ${k} must be a map (never undefined)`).toBe('object');
    expect(payload[k], `${label}: ${k} must not be null`).not.toBeNull();
    expect(Array.isArray(payload[k]), `${label}: ${k} must be a map, not an array`).toBe(false);
  }
  expect(typeof payload.isConfirmed, `${label}: isConfirmed must be a boolean`).toBe('boolean');
  // No unknown keys: every key on the wire is a contract key.
  for (const k of Object.keys(payload)) {
    expect(CONTRACT_PAYLOAD_KEYS.includes(k), `${label}: unknown key "${k}" leaked onto the wire`).toBe(true);
  }
}

function makeBars(count: number, startPrice = 100, baseTime = 1700000000000): Array<{
  timestamp: number; open: number; high: number; low: number; close: number; volume: number;
}> {
  const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = open + 2;
    bars.push({
      timestamp: baseTime + i * 3600000,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 1000,
    });
    price = close;
  }
  return bars;
}

describe('contract parity — REST vs WS full vs WS diff (shared execution-result contract)', () => {
  let server: Server;
  let baseUrl: string;

  // supertrend-3d: 2 force_overlay plots + hiddenPlotKeys/plotOverlayKeys (the
  // aafca12 pane-vanish class) — the same fixture the pane-vanish regression
  // uses, so a collection missing on one path is caught.
  const source = fs.readFileSync('./test_indicators/supertrend-3d.pine', 'utf-8');
  const bars = makeBars(60);

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', createExecuteRouter(createPineScriptEngine(), new InMemoryCancellationRegistry()));
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  async function restExecute(): Promise<Record<string, unknown>> {
    const res = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, bars }),
    });
    expect(res.status, 'REST /execute must return 200').toBe(200);
    return (await res.json()) as Record<string, unknown>;
  }

  async function wsFull(): Promise<ScriptOutputs> {
    const session = new ScriptSession(source, 'BTCUSDT', '60', bars);
    return session.initialize();
  }

  async function wsDiff(): Promise<ScriptOutputs> {
    const session = new ScriptSession(source, 'BTCUSDT', '60', bars);
    await session.initialize();
    const lastBar = bars[bars.length - 1]!;
    // Forming tick on the same timestamp as the last bar (tick → toFormingCandleOutputs).
    const formingBar = {
      timestamp: lastBar.timestamp,
      open: lastBar.open,
      high: Math.max(lastBar.high, lastBar.close + 1),
      low: Math.min(lastBar.low, lastBar.close - 1),
      close: lastBar.close + 1,
      volume: lastBar.volume,
    };
    return session.appendOrUpdateBar(formingBar);
  }

  it('REST /execute — FULL variant: all 17 collections present, isConfirmed true, no unknown keys, real data rides', async () => {
    const payload = await restExecute();
    assertContractShape(payload, 'REST');
    expect(payload.isConfirmed, 'REST must be isConfirmed: true').toBe(true);
    expect(typeof payload.maxLookback, 'REST-only maxLookback must be a number').toBe('number');
    // Real data rides the payload — not empty shells (outputs + overlay keys).
    expect(Object.keys(payload.outputs as object).length).toBeGreaterThan(0);
    expect((payload.plotOverlayKeys as string[]).length).toBeGreaterThan(0);
  });

  it('WS full (ScriptSession.initialize → toOutputs) — SAME required key set as REST, isConfirmed true, overlay keys survive', async () => {
    const out = await wsFull();
    assertContractShape(out as unknown as Record<string, unknown>, 'WS full');
    expect(out.isConfirmed, 'WS full must be isConfirmed: true').toBe(true);
    expect(Object.keys(out.outputs as object).length).toBeGreaterThan(0);
    // aafca12 class: plotOverlayKeys/hiddenPlotKeys survive on the WS full path.
    expect(Array.isArray(out.plotOverlayKeys)).toBe(true);
    expect((out.plotOverlayKeys ?? []).length).toBeGreaterThan(0);
    expect(Array.isArray(out.hiddenPlotKeys)).toBe(true);
  });

  it('WS diff (forming tick → toFormingCandleOutputs) — SAME required key set, isConfirmed false, every collection present EVEN IF EMPTY', async () => {
    const out = await wsDiff();
    assertContractShape(out as unknown as Record<string, unknown>, 'WS diff');
    expect(out.isConfirmed, 'WS diff must be isConfirmed: false').toBe(false);
    expect(out.formingCandle).toBe(true);
    // 8th-gap regression (was this.cachedAlertConditions): never undefined on the diff.
    expect(Array.isArray(out.alertConditions), 'WS diff alertConditions must be an array, never undefined').toBe(true);
    // boxes+tables-on-diff regression: the keys were MISSING entirely pre-B2; now [].
    expect(out.boxes).toEqual([]);
    expect(out.tables).toEqual([]);
    // aafca12 class: overlay keys survive on the diff path too.
    expect(Array.isArray(out.plotOverlayKeys)).toBe(true);
    expect((out.plotOverlayKeys ?? []).length).toBeGreaterThan(0);
    expect(Array.isArray(out.hiddenPlotKeys)).toBe(true);
  });

  it('IDENTICAL REQUIRED key set across REST + WS full + WS diff — a REQUIRED key missing on one path = FAIL', async () => {
    const rest = await restExecute();
    const full = (await wsFull()) as unknown as Record<string, unknown>;
    const diff = (await wsDiff()) as unknown as Record<string, unknown>;
    const restKeys = REQUIRED_KEY_SET.filter((k) => k in rest).sort();
    const fullKeys = REQUIRED_KEY_SET.filter((k) => k in full).sort();
    const diffKeys = REQUIRED_KEY_SET.filter((k) => k in diff).sort();
    expect(restKeys, 'REST must carry every REQUIRED key').toEqual(REQUIRED_KEY_SET.slice().sort());
    expect(fullKeys, 'WS full must carry every REQUIRED key').toEqual(REQUIRED_KEY_SET.slice().sort());
    expect(diffKeys, 'WS diff must carry every REQUIRED key').toEqual(REQUIRED_KEY_SET.slice().sort());
    expect(fullKeys, 'WS full required-key set must equal REST').toEqual(restKeys);
    expect(diffKeys, 'WS diff required-key set must equal REST').toEqual(restKeys);
  });
});

describe('normalizeExecutionResultMessage — the "even if empty" guarantee at the contract level', () => {
  it('an EMPTY input normalizes to the full contract key set: 17 collections filled with [] / {}, isConfirmed defaults to false (diff)', () => {
    const out = normalizeExecutionResultMessage({}) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(CONTRACT_PAYLOAD_KEYS.slice().sort());
    expect(out.isConfirmed).toBe(false);
    for (const k of ARRAY_COLLECTION_KEYS) {
      expect(Array.isArray(out[k]), `${k} must be []`).toBe(true);
      expect((out[k] as unknown[]).length).toBe(0);
    }
    for (const k of MAP_COLLECTION_KEYS) {
      expect(typeof out[k]).toBe('object');
      expect(Object.keys(out[k] as object)).toHaveLength(0);
    }
  });

  it('strips unknown keys by construction (payload key set == contract key set)', () => {
    const input = {
      success: true,
      bogus: 'x',
      outputs: { p: [1, 2] },
    } as ExecutionResultMessageInput;
    const out = normalizeExecutionResultMessage(input) as Record<string, unknown>;
    expect('bogus' in out).toBe(false);
    expect(out.outputs).toEqual({ p: [1, 2] });
  });

  it('never mutates its input (defensive copies — producers may reuse the payload)', () => {
    const input: ExecutionResultMessageInput = {
      outputs: { p: [1, 2] },
      shapes: [{ style: 'circle', location: 'abovebar', color: '#f00', time: 1, text: 's' }],
    };
    const before = JSON.stringify(input);
    normalizeExecutionResultMessage(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('isConfirmed: true round-trips to the FULL variant (REST producer sets it BEFORE normalizing)', () => {
    const out = normalizeExecutionResultMessage({ isConfirmed: true });
    expect(out.isConfirmed).toBe(true);
  });
});
