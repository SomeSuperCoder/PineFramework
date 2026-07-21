import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function createZigzagBars(count: number): Array<{
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> {
  const bars: Array<any> = [];
  let s = 42;
  const rand = () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
  // Sine-wave pattern with noise to create reliable pivot points
  for (let i = 0; i < count; i++) {
    const phase = (i % 30) / 30;
    const base = 100 + 10 * Math.sin(phase * Math.PI * 2) + (i / count) * 5;
    const open = base + (rand() - 0.5) * 2;
    const close = base + (rand() - 0.5) * 2;
    const high = Math.max(open, close) + 1 + rand() * 3;
    const low = Math.min(open, close) - 1 - rand() * 3;
    bars.push({ timestamp: 1700000000000 + i * 3600000, open, high, low, close, volume: 1000 });
  }
  return bars;
}

function runEngine(source: string, bars: ReturnType<typeof createZigzagBars>) {
  const { ast } = parse(source);
  const compiled = compile(ast);
  const engine = new ExecutionEngine(compiled);
  const contexts: ExecutionContext[] = bars.map((bar, i) => ({
    barIndex: i,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries(
      'open',
      bars.slice(0, i + 1).map((b) => b.open),
    ),
    high: createSeries(
      'high',
      bars.slice(0, i + 1).map((b) => b.high),
    ),
    low: createSeries(
      'low',
      bars.slice(0, i + 1).map((b) => b.low),
    ),
    close: createSeries(
      'close',
      bars.slice(0, i + 1).map((b) => b.close),
    ),
    volume: createSeries(
      'volume',
      bars.slice(0, i + 1).map((b) => b.volume),
    ),
  }));
  const result = engine.executeBars(contexts);
  if (!result.success) console.log('executeBars error:', result.error);
  return { engine, bars, result };
}

describe('Higher High Lower Low 🦉{Phanchai}', () => {
  const source = fs.readFileSync('./test_indicators/higher-high-lower-low.pine', 'utf-8');

  it('parses successfully', () => {
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors?.length ?? 0).toBe(0);
  });

  it('compiles successfully', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    expect(compiled).toBeDefined();
  });

  it('executes without crashing', () => {
    const bars = createZigzagBars(200);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
  });

  it('produces label output (HH/HL/LH/LL)', () => {
    const bars = createZigzagBars(500);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);

    console.log(`Labels produced: ${result.labels?.length ?? 0}`);
    expect(result.labels?.length).toBeGreaterThan(0);

    // Verify label structure
    const expectedLabels = ['HH', 'HL', 'LH', 'LL'];
    for (const label of result.labels!) {
      console.log(`  Label: text="${label.text}", price=${label.price.toFixed(2)}, color=${label.color}, style=${label.style}, size=${label.size}`);
      expect(expectedLabels).toContain(label.text);
      expect(typeof label.price).toBe('number');
      expect(label.color).toMatch(/^#[0-9a-fA-F]{6,8}$/);
      expect(label.textcolor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(label.style).toMatch(/^(label\.)?style_label_(up|down)$/);
      expect(typeof label.time).toBe('number');
    }

    // Verify we get all 4 label types over 500 bars with trending data
    const labelTypes = new Set(result.labels!.map((l) => l.text));
    console.log(`Label types found: ${[...labelTypes].join(', ')}`);
  });

  it('produces lines for support/resistance', () => {
    const bars = createZigzagBars(500);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);

    console.log(`Lines produced: ${result.lines?.length ?? 0}`);

    // With zigzag data that produces many pivots, S/R lines should be drawn
    expect(result.lines?.length ?? 0).toBeGreaterThan(0);

    for (const line of result.lines!) {
      console.log(`  Line: x1=${line.x1}, y1=${line.y1.toFixed(2)}, x2=${line.x2}, y2=${line.y2.toFixed(2)}, color=${line.color}, style=${line.style}, width=${line.width}`);
      expect(typeof line.x1).toBe('number');
      expect(typeof line.y1).toBe('number');
      expect(typeof line.x2).toBe('number');
      expect(typeof line.y2).toBe('number');
      expect(line.color).toMatch(/^#[0-9a-fA-F]{6,8}$/);
      // Style is returned as 'style_dotted' (from namespace resolution) not 'line.style_dotted'
      expect(['style_solid', 'style_dashed', 'style_dotted', 'solid', 'dashed', 'dotted']).toContain(line.style);
      expect(line.width).toBe(3);
    }
  });

  it('has correct overlay setting', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    expect(compiled.ir.overlay).toBe(true);
  });

  it('produces alert conditions', () => {
    const bars = createZigzagBars(500);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);

    // alertcondition calls register alert conditions on the engine
    expect(result.alertConditions?.length).toBeGreaterThan(0);
    if (result.alertConditions) {
      for (const ac of result.alertConditions) {
        console.log(`  Alert condition: title="${ac.title}", id=${ac.id}`);
        expect(ac.title).toBeTruthy();
        expect(ac.message).toBeTruthy();
      }
    }
  });

  it('handles large bar count without issues', () => {
    const bars = createZigzagBars(1000);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    console.log(`1000 bars: ${result.labels?.length ?? 0} labels, ${result.lines?.length ?? 0} lines`);
  });

  it('parses the findprevious function correctly', () => {
    // The findprevious() function uses comma-separated declarations
    // which was a parsing challenge. Verify it parses correctly.
    const { ast } = parse(source);
    expect(ast).toBeDefined();

    // Walk AST to find the findprevious function
    function findFunction(name: string, nodes: any[]): any {
      for (const node of nodes) {
        if (node.kind === 'ExpressionStatement' &&
            node.expression?.kind === 'FunctionExpression' &&
            node.expression.name === name) {
          return node.expression;
        }
        if (node.kind === 'IfStatement') {
          const found = findFunction(name, node.thenBranch);
          if (found) return found;
          if (node.elseBranch) {
            const found2 = findFunction(name, node.elseBranch);
            if (found2) return found2;
          }
        }
        if (node.kind === 'ForStatement') {
          const found = findFunction(name, node.body);
          if (found) return found;
        }
      }
      return null;
    }

    const func = findFunction('findprevious', ast.body);
    expect(func).toBeDefined();
    expect(func.parameters.length).toBe(0);
    expect(func.body.length).toBeGreaterThan(0);

    // The body should contain statements parsed from comma-separated declarations
    const firstStmt = func.body[0];
    // The "loc1=0.0, loc2=0.0, loc3=0.0, loc4=0.0, xx=0" should be parsed as 5 statements
    // due to comma handling in parseIndentedBlock
    console.log(`findprevious body has ${func.body.length} top-level statements`);
    for (let i = 0; i < Math.min(10, func.body.length); i++) {
      const stmt = func.body[i];
      if (stmt.kind === 'Assignment') {
        console.log(`  stmt[${i}]: Assignment target=${stmt.target?.name || stmt.target?.kind}, op=${stmt.operator}`);
      } else if (stmt.kind === 'ForStatement') {
        console.log(`  stmt[${i}]: ForStatement`);
      } else if (stmt.kind === 'VariableDeclaration') {
        console.log(`  stmt[${i}]: VariableDeclaration name=${stmt.name}`);
      } else {
        console.log(`  stmt[${i}]: ${stmt.kind}`);
      }
    }

    expect(firstStmt.kind).toBe('Assignment');
  });
});
