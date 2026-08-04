import { describe, it, expect } from 'vitest';
import { extractScriptName } from '../../../src/utils/script-name.js';

describe('extractScriptName', () => {
  it('extracts positional name from a strategy declaration', () => {
    expect(extractScriptName('strategy("MA Crossover", overlay=true)')).toBe('MA Crossover');
  });

  it('extracts positional name from an indicator declaration', () => {
    expect(extractScriptName('indicator("RSI", overlay=false)')).toBe('RSI');
  });

  it('extracts positional name with single quotes', () => {
    expect(extractScriptName("strategy('Long Only')")).toBe('Long Only');
  });

  it('extracts named title argument', () => {
    expect(extractScriptName('indicator(title="RSI", shorttitle="RSI")')).toBe('RSI');
  });

  it('prefers positional name over title argument', () => {
    expect(extractScriptName('strategy("Pos Name", title="Title Name")')).toBe('Pos Name');
  });

  it('returns null when no declaration name is present', () => {
    expect(extractScriptName('//@version=6\nplot(close)')).toBeNull();
    expect(extractScriptName('strategy()')).toBeNull();
    expect(extractScriptName('strategy(overlay=true)')).toBeNull();
    expect(extractScriptName('')).toBeNull();
  });

  it('returns null for a library declaration with no name argument', () => {
    expect(extractScriptName('library(overlay=true)')).toBeNull();
  });

  it('handles whitespace between declaration name and paren', () => {
    expect(extractScriptName('strategy  ("Wide", overlay=true)')).toBe('Wide');
  });
});
