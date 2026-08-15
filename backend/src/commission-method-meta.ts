/**
 * commission-method-meta.ts
 *
 * THE backend-side source of canonical commission-method metadata — labels,
 * descriptions, and accepted-value text. This is the backend twin of the
 * frontend's COMMISSION_METHOD_LABELS (frontend/src/types/index.ts, the
 * types-mirror): content MUST stay identical to that mirror, so there is ONE
 * naming scheme across UI/CLI/exports (contract design D8).
 *
 * Labels are the D8 canonical names ("Jupiter Swap" / "Jupiter Ultra") — these
 * deliberately differ from the engine's UI-panel descriptor names
 * (src/strategy/commission-calculator.ts METHOD_DESCRIPTORS, "Jupiter (Basic
 * Swap)"). Descriptions mirror that engine descriptor SSOT verbatim.
 *
 * Consumers: the CLI (--commission-method parsing / help / errors) and any
 * future backend surface. Nothing else may hard-code these strings.
 */

import type { CommissionMethodId } from 'pine-framework';

/** The two official commission methods (union SSOT: src/strategy/commission-methods/types.ts). */
export const COMMISSION_METHOD_IDS: readonly CommissionMethodId[] = ['jupiter_ultra', 'jupiter_manual'];

/** Canonical display labels (contract D8) — identical to the frontend mirror. */
export const COMMISSION_METHOD_LABELS: Record<CommissionMethodId, string> = {
  jupiter_manual: 'Jupiter Swap',
  jupiter_ultra: 'Jupiter Ultra',
};

/** Human-readable accepted-value text for CLI/API errors ("jupiter_ultra, jupiter_manual"). */
export const COMMISSION_METHOD_ACCEPTED_TEXT = COMMISSION_METHOD_IDS.join(', ');

/**
 * Resolve a CLI-supplied method value to its canonical id. Accepts, case-
 * insensitively:
 *   - canonical ids:          jupiter_ultra / jupiter_manual
 *   - kebab names (DEX kinds): jupiter-ultra / jupiter-swap  (swap → manual,
 *     matching the D7 live-kind mapping)
 *   - display labels:          "Jupiter Ultra" / "Jupiter Swap"
 *
 * Returns null for anything else so the caller can emit the accepted-values
 * error text. The canonical id is what reaches the normalizer.
 */
export function resolveCommissionMethodAlias(raw: string): CommissionMethodId | null {
  const lower = raw.trim().toLowerCase();
  if (lower === 'jupiter_ultra' || lower === 'jupiter-ultra') return 'jupiter_ultra';
  if (lower === 'jupiter_manual' || lower === 'jupiter-swap') return 'jupiter_manual';
  if (lower === COMMISSION_METHOD_LABELS.jupiter_ultra.toLowerCase()) return 'jupiter_ultra';
  if (lower === COMMISSION_METHOD_LABELS.jupiter_manual.toLowerCase()) return 'jupiter_manual';
  return null;
}
