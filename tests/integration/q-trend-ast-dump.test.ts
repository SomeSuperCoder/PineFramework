import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';

function findMStatements(node: any, depth = 0): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n) => findMStatements(n, depth));
    return;
  }
  if (node.kind === 'Assignment' && node.target?.name === 'm') {
    const indent = '  '.repeat(depth);
    console.log(indent + 'line ' + (node.span?.startLine || '?') + ': op=' + node.operator);
    console.log(indent + '  value kind: ' + node.value?.kind);
    if (node.value?.kind === 'TernaryExpression') {
      const c = node.value.condition;
      console.log(indent + '  Ternary condition kind: ' + c?.kind);
      // Find all m references in the ternary
      function findRefs(expr: any, label: string): void {
        if (!expr || typeof expr !== 'object') return;
        if (expr.kind === 'IndexExpression' && (expr.object as any)?.name === 'm') {
          const index = (expr.index as any)?.kind === 'NumberLiteral' ? (expr.index as any).value : '?';
          console.log(indent + '    [' + label + '] m[' + index + '] at line ' + (expr.span?.startLine || '?'));
        }
        if (expr.kind === 'Identifier' && expr.name === 'm') {
          console.log(indent + '    [' + label + '] m (bare) at line ' + (expr.span?.startLine || '?'));
        }
        for (const k of Object.keys(expr)) {
          if (k === 'parent') continue;
          findRefs(expr[k], label);
        }
      }
      findRefs(c, 'cond');
      findRefs(node.value.thenExpr, 'then');
      findRefs(node.value.elseExpr, 'else');
    }
    if (node.value?.kind === 'ConditionalExpression') {
      console.log(indent + '  (conditional expression)');
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    findMStatements((node as any)[key], depth);
  }
}

describe('AST dump for m variable', () => {
  it('dumps m assignments', () => {
    const source = fs.readFileSync('./test_indicators/q-trend.pine', 'utf-8');
    const { ast } = parse(source);
    console.log('=== m assignment AST ===');
    findMStatements(ast);
  });
});
