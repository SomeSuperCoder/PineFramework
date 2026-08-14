/**
 * normalize-explicit-config.ts
 *
 * The single authority for resolving producer input into the canonical
 * ExplicitBacktestOverride (backtest-contract.ts). Implements
 * NormalizeExplicitOverride: validate + shape — it NEVER merges defaults.
 *
 * EXPLICIT-VS-ABSENT (contract core rule — design D1):
 *   - ABSENT field  → resolve from the script-declared defaults at the ENGINE's
 *                     single merge point (execution-engine.ts initializeStrategy,
 *                     `{ ...strategyConfig, ...override }`).
 *   - PRESENT field → the user explicitly wants this value.
 *   - NULL is NEVER "absent" → rejected (NULL_NOT_ALLOWED). Optional fields are
 *     simply omitted from the request.
 *   - Unknown keys are REJECTED, not ignored (UNKNOWN_FIELD) — a typo like
 *     `initial_capital` must fail loudly, never silently resolve from defaults.
 *
 * The returned value is copy-only-present: undefined keys are never emitted,
 * preserving buildBacktestConfigOverride's load-bearing omission behavior so a
 * narrow input never clobbers engine defaults.
 *
 * The engine merge (execution-engine.ts:456-475) stays the ONLY merge point.
 * ok:false → the run MUST NOT start (API 400 / CLI explicit error + non-zero).
 */

import type {
  BacktestCommissionMethodId,
  BacktestCommissionMethodSettings,
  ContractValidationError,
  ExplicitBacktestOverride,
  NormalizeExplicitOverride,
} from './backtest-contract.js';

// ============================================================================
// Whitelists — the contract's field surface. Adding a contract field = adding
// it here (plus validation + assembly below); the normalizer logic itself is
// never edited to accept new fields.
// ============================================================================

/** Top-level keys the contract accepts. Anything else → UNKNOWN_FIELD. */
const KNOWN_FIELDS = new Set<string>([
  'commissionMethod',
  'commissionMethodSettings',
  'initialCapital',
  'slippage',
  'slippageType',
  'defaultQty',
  'defaultQtyType',
  'pyramiding',
  'marginLong',
  'marginShort',
]);

const COMMISSION_METHODS: readonly BacktestCommissionMethodId[] = ['jupiter_ultra', 'jupiter_manual'];
const ACCEPTED_METHODS_TEXT = COMMISSION_METHODS.join(', ');

const SLIPPAGE_TYPES = ['percent', 'ticks', 'points'] as const;
const DEFAULT_QTY_TYPES = ['contracts', 'percent_of_equity', 'cash'] as const;

/** Jupiter Ultra pair categories (commission-methods types.ts JupiterPairCategory). */
const PAIR_CATEGORIES: ReadonlySet<string> = new Set([
  'jupiter_ecosystem',
  'pegged_asset',
  'sol_stable',
  'lst_stable',
  'default',
  'new_token',
  'custom',
]);

/**
 * Official settings keys, typed per method (design: "typed per method — never
 * Record<string, unknown>"). UI-state keys (useCustomRate/useCustom) are NOT
 * contract keys — the normalizer rejects them (UNKNOWN_FIELD); the frontend
 * strips them before sending (request-parity wave F1).
 */
const OFFICIAL_SETTINGS_KEYS: Record<BacktestCommissionMethodId, ReadonlySet<string>> = {
  jupiter_ultra: new Set(['pairCategory', 'rate', 'solPriceUsd', 'dexFeeBps']),
  jupiter_manual: new Set(['solPriceUsd', 'dexFeeBps']),
};
const ALL_SETTINGS_KEYS = new Set<string>([
  ...OFFICIAL_SETTINGS_KEYS.jupiter_ultra,
  ...OFFICIAL_SETTINGS_KEYS.jupiter_manual,
]);

/**
 * Error text for fields dropped from the old producer shapes (legacy fee path
 * dead, currency engine-resolved). UNKNOWN_FIELD code, actionable message.
 */
const DROPPED_FIELD_MESSAGES: Record<string, string> = {
  commission:
    '"commission" is no longer accepted — the legacy fee path is dead; use commissionMethod + commissionMethodSettings (commission-methods spec)',
  commissionType:
    '"commissionType" is no longer accepted — the legacy fee path is dead; use commissionMethod + commissionMethodSettings (commission-methods spec)',
  currency:
    '"currency" is no longer accepted — producers never set it; the engine resolves USD',
};

// ============================================================================
// Helpers
// ============================================================================

function isCommissionMethod(v: unknown): v is BacktestCommissionMethodId {
  return typeof v === 'string' && (COMMISSION_METHODS as readonly string[]).includes(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface NumberFieldRule {
  /** Reject values below this bound. */
  min: number;
  /** When true, the bound itself is rejected (must be strictly greater). */
  exclusiveMin?: boolean;
}

/**
 * Validate a present numeric field: null → NULL_NOT_ALLOWED, non-number →
 * INVALID_FIELD_TYPE, out-of-range → INVALID_FIELD_VALUE. Absent → no-op
 * (explicit-vs-absent: absent resolves from engine defaults).
 */
function validateNumberField(
  input: Record<string, unknown>,
  field: string,
  rule: NumberFieldRule,
  errors: ContractValidationError[],
): void {
  const v = input[field];
  if (v === undefined) return;
  if (v === null) {
    errors.push({ code: 'NULL_NOT_ALLOWED', field, message: `"${field}" must not be null — omit the field instead of passing null` });
    return;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    errors.push({ code: 'INVALID_FIELD_TYPE', field, message: `"${field}" must be a finite number` });
    return;
  }
  const outOfRange = rule.exclusiveMin ? v <= rule.min : v < rule.min;
  if (outOfRange) {
    errors.push({
      code: 'INVALID_FIELD_VALUE',
      field,
      message: rule.exclusiveMin
        ? `"${field}" must be greater than ${rule.min}`
        : `"${field}" must be at least ${rule.min}`,
    });
  }
}

/** Validate a present string-enum field. */
function validateEnumField(
  input: Record<string, unknown>,
  field: string,
  validValues: readonly string[],
  errors: ContractValidationError[],
): void {
  const v = input[field];
  if (v === undefined) return;
  if (v === null) {
    errors.push({ code: 'NULL_NOT_ALLOWED', field, message: `"${field}" must not be null — omit the field instead of passing null` });
    return;
  }
  if (typeof v !== 'string') {
    errors.push({ code: 'INVALID_FIELD_TYPE', field, message: `"${field}" must be a string` });
    return;
  }
  if (!validValues.includes(v)) {
    errors.push({
      code: 'INVALID_FIELD_VALUE',
      field,
      message: `"${field}" must be one of: ${validValues.join(', ')}`,
    });
  }
}

/**
 * Validate commissionMethodSettings against the chosen method's official keys
 * and per-field types. Empty object = no explicit fee values (valid).
 */
function validateCommissionMethodSettings(
  raw: unknown,
  method: unknown,
  errors: ContractValidationError[],
): void {
  const field = 'commissionMethodSettings';
  if (raw === null) {
    errors.push({ code: 'NULL_NOT_ALLOWED', field, message: `"${field}" must not be null — omit it or pass {}` });
    return;
  }
  if (!isPlainObject(raw)) {
    errors.push({ code: 'INVALID_FIELD_TYPE', field, message: `"${field}" must be an object` });
    return;
  }
  const settings = raw;
  // When the method is valid, validate against ITS keys; otherwise fall back to
  // the union so settings errors don't cascade on top of a bad method.
  const allowed = isCommissionMethod(method) ? OFFICIAL_SETTINGS_KEYS[method] : ALL_SETTINGS_KEYS;

  for (const key of Object.keys(settings)) {
    if (!allowed.has(key)) {
      errors.push({
        code: 'UNKNOWN_FIELD',
        field: `${field}.${key}`,
        message: `Unknown setting "${key}" for commission method "${method ?? '(unknown)'}". Accepted keys for this method: ${[...allowed].join(', ')}`,
      });
    }
  }

  const pairCategory = settings.pairCategory;
  if (pairCategory !== undefined) {
    if (pairCategory === null) {
      errors.push({ code: 'NULL_NOT_ALLOWED', field: `${field}.pairCategory`, message: '"pairCategory" must not be null — omit it' });
    } else if (typeof pairCategory !== 'string') {
      errors.push({ code: 'INVALID_FIELD_TYPE', field: `${field}.pairCategory`, message: '"pairCategory" must be a string' });
    } else if (!PAIR_CATEGORIES.has(pairCategory)) {
      errors.push({
        code: 'INVALID_FIELD_VALUE',
        field: `${field}.pairCategory`,
        message: `"pairCategory" must be one of: ${[...PAIR_CATEGORIES].join(', ')}`,
      });
    }
  }

  for (const key of ['rate', 'solPriceUsd', 'dexFeeBps'] as const) {
    const v = settings[key];
    if (v === undefined) continue;
    if (v === null) {
      errors.push({ code: 'NULL_NOT_ALLOWED', field: `${field}.${key}`, message: `"${field}.${key}" must not be null — omit it` });
    } else if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push({ code: 'INVALID_FIELD_TYPE', field: `${field}.${key}`, message: `"${field}.${key}" must be a finite number` });
    } else if (v < 0) {
      errors.push({ code: 'INVALID_FIELD_VALUE', field: `${field}.${key}`, message: `"${field}.${key}" must not be negative` });
    }
  }
}

// ============================================================================
// The normalizer
// ============================================================================

export const normalizeExplicitOverride: NormalizeExplicitOverride = (raw) => {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      errors: [{ code: 'INVALID_FIELD_TYPE', message: 'Explicit override must be an object' }],
    };
  }
  const input = raw;
  const errors: ContractValidationError[] = [];

  // 1. Unknown keys — REJECTED, not ignored (trust: a typo must fail loudly).
  for (const key of Object.keys(input)) {
    if (!KNOWN_FIELDS.has(key)) {
      errors.push({
        code: 'UNKNOWN_FIELD',
        field: key,
        message: DROPPED_FIELD_MESSAGES[key] ?? `Unknown field "${key}" — not part of the explicit-config contract (check the spelling)`,
      });
    }
  }

  // 2. commissionMethod — REQUIRED (absent method → explicit error, never a default).
  const methodRaw = input.commissionMethod;
  if (methodRaw === undefined) {
    errors.push({
      code: 'MISSING_COMMISSION_METHOD',
      field: 'commissionMethod',
      message: `Missing required field "commissionMethod". Accepted values: ${ACCEPTED_METHODS_TEXT}`,
    });
  } else if (methodRaw === null) {
    errors.push({
      code: 'NULL_NOT_ALLOWED',
      field: 'commissionMethod',
      message: '"commissionMethod" must not be null — provide a value',
    });
  } else if (typeof methodRaw !== 'string') {
    errors.push({
      code: 'INVALID_FIELD_TYPE',
      field: 'commissionMethod',
      message: `"commissionMethod" must be a string. Accepted values: ${ACCEPTED_METHODS_TEXT}`,
    });
  } else if (!isCommissionMethod(methodRaw)) {
    errors.push({
      code: 'INVALID_COMMISSION_METHOD',
      field: 'commissionMethod',
      message: `Invalid commission method "${methodRaw}". Accepted values: ${ACCEPTED_METHODS_TEXT}`,
    });
  }

  // 3. commissionMethodSettings — typed per method.
  if (input.commissionMethodSettings !== undefined) {
    validateCommissionMethodSettings(input.commissionMethodSettings, input.commissionMethod, errors);
  }

  // 4. Optional numeric + enum fields. Ranges follow the contract's examples
  // (initialCapital <= 0 invalid; negative margin invalid) and engine sanity.
  validateNumberField(input, 'initialCapital', { min: 0, exclusiveMin: true }, errors);
  validateNumberField(input, 'slippage', { min: 0 }, errors);
  validateNumberField(input, 'defaultQty', { min: 0, exclusiveMin: true }, errors);
  validateNumberField(input, 'pyramiding', { min: 0 }, errors);
  validateNumberField(input, 'marginLong', { min: 0 }, errors);
  validateNumberField(input, 'marginShort', { min: 0 }, errors);
  validateEnumField(input, 'slippageType', SLIPPAGE_TYPES, errors);
  validateEnumField(input, 'defaultQtyType', DEFAULT_QTY_TYPES, errors);

  if (errors.length > 0) return { ok: false, errors };

  // errors.length === 0 ⇒ every present field passed validation above, so the
  // casts below are safe. Copy-only-present: absent fields are never emitted,
  // preserving buildBacktestConfigOverride's load-bearing omission behavior.
  const value: ExplicitBacktestOverride = {
    commissionMethod: methodRaw as BacktestCommissionMethodId,
  };
  if (input.commissionMethodSettings !== undefined) {
    value.commissionMethodSettings = input.commissionMethodSettings as BacktestCommissionMethodSettings;
  }
  if (input.initialCapital !== undefined) value.initialCapital = input.initialCapital as number;
  if (input.slippage !== undefined) value.slippage = input.slippage as number;
  if (input.slippageType !== undefined) value.slippageType = input.slippageType as ExplicitBacktestOverride['slippageType'];
  if (input.defaultQty !== undefined) value.defaultQty = input.defaultQty as number;
  if (input.defaultQtyType !== undefined) value.defaultQtyType = input.defaultQtyType as ExplicitBacktestOverride['defaultQtyType'];
  if (input.pyramiding !== undefined) value.pyramiding = input.pyramiding as number;
  if (input.marginLong !== undefined) value.marginLong = input.marginLong as number;
  if (input.marginShort !== undefined) value.marginShort = input.marginShort as number;

  return { ok: true, value };
};
