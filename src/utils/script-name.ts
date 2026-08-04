// Centralized script-name extraction — single source of truth for deriving a
// human-readable name from a Pine Script strategy/indicator/study declaration.
// Used by the editor, quick indicator menu, bot setup Review step, and the
// running dashboard so every surface shows the same derived name.

const SCRIPT_NAME_POSITIONAL = /\b(?:strategy|indicator|study)\s*\(\s*["']([^"']+)["']/;
const SCRIPT_NAME_TITLE = /\b(?:strategy|indicator|study)\s*\(\s*title\s*=\s*["']([^"']+)["']/;

/**
 * Derive a script's display name from its top-level declaration.
 *
 * Prefers the positional first string argument (`strategy("Name", ...)`), then
 * the named `title="Name"` argument. Returns `null` when neither is present so
 * callers can apply their own fallback.
 */
export function extractScriptName(source: string): string | null {
  const positional = source.match(SCRIPT_NAME_POSITIONAL);
  if (positional) return positional[1];
  const titled = source.match(SCRIPT_NAME_TITLE);
  return titled ? titled[1] : null;
}
