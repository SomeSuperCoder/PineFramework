import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';

describe('SuperTrend AI (Clustering) [LuxAlgo]', () => {
  const source = fs.readFileSync(
    './test_indicators/supertrend-ai-clustering.pine',
    'utf-8',
  );

  it('parses successfully', () => {
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors?.length ?? 0).toBe(0);
  });

  it('compiles successfully with overlay=true', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    expect(compiled).toBeDefined();
    expect(compiled.ir.overlay).toBe(true);
  });
});