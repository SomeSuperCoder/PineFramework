/**
 * Shared built-in Pine-script store — the SSOT for built-in lookup.
 *
 * WHY this module exists: the /scripts/built-in REST route and the Telegram
 * /backtest wizard must resolve built-in scripts from the SAME source with the
 * SAME id format (`builtin_<basename>`). Previously only the route scanned
 * test_indicators/; the wizard never saw built-ins, so a deployment with an
 * empty user manifest reported "no strategies" in the bot while the frontend
 * listed the built-in EMA-cross strategy (bug 2, OpenSpec telegram-backtest-flow).
 *
 * Design rules:
 *  - Built-ins are NEVER written to the user manifest — the user store stays
 *    manifest-backed; this module is read-only over the built-in directory.
 *  - scanBuiltInScripts THROWS on fs errors; callers decide (the route maps to
 *    500, the wizard degrades to user strategies only).
 *  - getBuiltInScript NEVER throws and NEVER constructs filesystem paths from
 *    its id argument — ids are user-controlled (Telegram callback data), so the
 *    lookup matches against a real directory scan instead of joining paths.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

/** One built-in script as served by /api/scripts/built-in (contract shape). */
export interface BuiltInScriptEntry {
  id: string;
  name: string;
  source: string;
  type: 'strategy' | 'indicator';
}

/** Extract the human-readable script name from its Pine source declaration. */
function extractNameFromContent(source: string): string | null {
  // Match positional string: indicator("Name")
  const positionalMatch = source.match(
    /\b(?:indicator|strategy|library)\s*\(\s*["']([^"']+)["']/,
  );
  if (positionalMatch) return positionalMatch[1];

  // Match named title argument: indicator(title="Name")
  const namedMatch = source.match(
    /\b(?:indicator|strategy|library)\s*\(\s*title\s*=\s*["']([^"']+)["']/,
  );
  return namedMatch ? namedMatch[1] : null;
}

/** Canonical built-in id: `builtin_<basename>` (stable contract, route + wizard). */
function builtInScriptId(fileName: string): string {
  return `builtin_${basename(fileName, '.pine')}`;
}

/** Scan a directory of .pine files into BuiltInScriptEntry objects. */
export function scanBuiltInScripts(dir: string): BuiltInScriptEntry[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.pine'));
  return files.map((file) => {
    const source = readFileSync(join(dir, file), 'utf-8');
    const name = extractNameFromContent(source) || basename(file, '.pine');
    return {
      id: builtInScriptId(file),
      name,
      source,
      type: source.includes('strategy(') ? ('strategy' as const) : ('indicator' as const),
    };
  });
}

/** Resolve one built-in by its `builtin_*` id, or undefined when not found. */
export function getBuiltInScript(dir: string, id: string): BuiltInScriptEntry | undefined {
  // Fast path: user ids are uuids, never `builtin_`-prefixed. The lookup below
  // is deliberately a scan match, NOT a path join — id is user-controlled and
  // must never reach the filesystem.
  if (!id.startsWith('builtin_')) return undefined;
  try {
    return scanBuiltInScripts(dir).find((entry) => entry.id === id);
  } catch {
    return undefined;
  }
}
