export type ScriptType = 'strategy' | 'indicator' | 'library';

export interface ScriptTypeInfo {
  type: ScriptType;
  name: string | null;
}

export function detectScriptType(source: string): ScriptTypeInfo {
  const strategyMatch = source.match(/\bstrategy\s*\(\s*["']([^"']+)["']/);
  if (strategyMatch) {
    return { type: 'strategy', name: strategyMatch[1] };
  }

  const libraryMatch = source.match(/\blibrary\s*\(\s*["']([^"']+)["']/);
  if (libraryMatch) {
    return { type: 'library', name: libraryMatch[1] };
  }

  const indicatorMatch = source.match(/\bindicator\s*\(\s*["']([^"']+)["']/);
  if (indicatorMatch) {
    return { type: 'indicator', name: indicatorMatch[1] };
  }

  if (/\bstrategy\s*\(/.test(source)) {
    return { type: 'strategy', name: null };
  }

  if (/\blibrary\s*\(/.test(source)) {
    return { type: 'library', name: null };
  }

  return { type: 'indicator', name: null };
}
