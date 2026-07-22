import type { ExecutionEngine } from '../execution-engine.js';
import { NA, pineTruthy, type PineValue } from '../../types/na.js';

export function registerAlertBuiltins(engine: ExecutionEngine): void {
  const eng = engine as any;

  eng.builtins.set('alertcondition', (...args: PineValue[]): PineValue => {
    const namedArgs =
      args.length > 0 &&
      typeof args[args.length - 1] === 'object' &&
      !Array.isArray(args[args.length - 1])
        ? (args[args.length - 1] as unknown as Record<string, PineValue>)
        : {};
    const condition = args[0] ?? NA;
    const titleVal =
      namedArgs['title'] ??
      (args.length > 1 && typeof args[1] === 'string' ? args[1] : undefined);
    const msgVal =
      namedArgs['message'] ??
      (args.length > 2 && typeof args[2] === 'string' ? args[2] : undefined);
    const title =
      typeof titleVal === 'string' ? titleVal : `Alert ${eng.alertConditionEntries.length + 1}`;
    const message = typeof msgVal === 'string' ? msgVal : title;
    const existing = eng.alertConditionEntries.find((e: { title: string }) => e.title === title);
    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      id = `alert_${eng.alertConditionEntries.length + 1}`;
      eng.alertConditionEntries.push({ id, title, message });
    }
    if (pineTruthy(condition) && eng.currentContext) {
      eng.alertTriggers.push({
        alertId: id,
        barIndex: eng.currentContext.barIndex,
        timestamp: eng.currentContext.timestamp,
      });
      eng.trimAlertArrays();
    }
    return NA;
  });

  eng.builtins.set('alert', (...args: PineValue[]): PineValue => {
    const message = typeof args[0] === 'string' ? args[0] : 'Alert triggered';
    if (eng.currentContext) {
      eng.alertTriggers.push({
        alertId: message,
        barIndex: eng.currentContext.barIndex,
        timestamp: eng.currentContext.timestamp,
      });
      eng.trimAlertArrays();
    }
    return NA;
  });
}
