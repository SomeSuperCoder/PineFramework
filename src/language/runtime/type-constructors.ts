/**
 * Type constructor dispatch for Pine Script runtime.
 * Handles TypeName.new(...) user type constructor calls.
 */
import type { PineValue } from '../types/na.js';
import type { ExpressionNode } from '../parser/ast/nodes.js';
import type { RuntimeScope } from './scope.js';
import type { ExecutionContext } from './execution-types.js';

export type ExpressionDispatch = (
  expr: ExpressionNode,
  scope: RuntimeScope,
  context: ExecutionContext,
) => PineValue;

/**
 * Execute a user-defined type constructor (TypeName.new(...)).
 * Creates an object with fields filled from positional args or defaults.
 */
export function executeTypeConstructor(
  fields: { name: string; defaultExpr: ExpressionNode | null }[],
  args: PineValue[],
  dispatch: ExpressionDispatch,
  scope: RuntimeScope,
  context: ExecutionContext,
): PineValue {
  const obj: Record<string, PineValue> = {};
  for (let i = 0; i < fields.length; i++) {
    if (i < args.length) {
      obj[fields[i]!.name] = args[i]!;
    } else if (fields[i]!.defaultExpr) {
      const defaultVal = dispatch(fields[i]!.defaultExpr!, scope, context);
      obj[fields[i]!.name] = defaultVal;
    }
  }
  return obj as unknown as PineValue;
}
