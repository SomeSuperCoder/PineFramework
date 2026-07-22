/**
 * Legacy entry point — delegates to the domain-split builtin registration
 * functions.  Imported by existing code as `registerOtherBuiltins(engine)`.
 *
 * New code should import the specific registration function it needs from the
 * individual domain modules in this directory.
 */
import type { ExecutionEngine } from '../execution-engine.js';
import { registerInputBuiltins } from './input-builtins.js';
import { registerTableBuiltins } from './table-builtins.js';
import { registerDrawingBuiltins } from './drawing-builtins.js';
import { registerAlertBuiltins } from './alert-builtins.js';
import { registerArrayBuiltins } from './array-builtins.js';
import { registerUtilityBuiltins } from './utility-builtins.js';

export function registerOtherBuiltins(engine: ExecutionEngine): void {
  registerInputBuiltins(engine);
  registerTableBuiltins(engine);
  registerDrawingBuiltins(engine);
  registerArrayBuiltins(engine);
  registerAlertBuiltins(engine);
  registerUtilityBuiltins(engine);
}
