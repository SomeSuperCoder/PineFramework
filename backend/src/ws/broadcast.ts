/**
 * Shared broadcast channel for indicator removal notifications.
 * Replaces the previous globalThis.__wsBroadcastIndicatorRemoved pattern
 * with a proper module-level function set via dependency injection.
 */

let broadcastFn: ((indicatorIds: string[]) => void) | null = null;

export function setBroadcastIndicatorRemoved(fn: (indicatorIds: string[]) => void): void {
  broadcastFn = fn;
}

export function broadcastIndicatorRemoved(indicatorIds: string[]): void {
  broadcastFn?.(indicatorIds);
}

export function hasBroadcastFn(): boolean {
  return broadcastFn !== null;
}
