/**
 * Generic, type-safe finite state machine with transition guards and event hooks.
 *
 * @module trading
 */

import { BotState, BOT_STATE_TRANSITIONS } from './types.js';
import type { StateTransition } from './types.js';

/** Handler signature for state change events. */
export type StateChangeHandler<TState extends string> = (
  from: TState,
  to: TState,
  reason: string,
) => void;

/** Guard function that can veto a transition. Returns true if allowed. */
export type TransitionGuard<TState extends string> = (
  from: TState,
  to: TState,
) => boolean | Promise<boolean>;

/**
 * Configuration for building a state machine.
 */
export interface StateMachineConfig<TState extends string> {
  /** Initial state. */
  initialState: TState;
  /** Valid transition map: from state → set of allowed to-states. */
  transitions: Record<TState, Set<TState>>;
  /** Optional transition guards (all must pass). */
  guards?: TransitionGuard<TState>[];
  /** Optional change handler called on every successful transition. */
  onChange?: StateChangeHandler<TState>;
}

/**
 * Generic finite state machine.
 *
 * Features:
 * - Type-safe states and transitions
 * - Async guard support
 * - Transition history with reasons
 * - Event hooks for observers
 */
export class StateMachine<TState extends string> {
  private _state: TState;
  private readonly transitions: Record<TState, Set<TState>>;
  private readonly guards: TransitionGuard<TState>[];
  private readonly onChange: StateChangeHandler<TState> | undefined;
  private readonly history: StateTransition<TState>[] = [];
  private readonly maxHistory: number;

  constructor(config: StateMachineConfig<TState>, maxHistory = 1000) {
    this._state = config.initialState;
    this.transitions = config.transitions;
    this.guards = config.guards ?? [];
    this.onChange = config.onChange;
    this.maxHistory = maxHistory;
  }

  /** The current state. */
  get state(): TState {
    return this._state;
  }

  /** Returns a read-only view of the transition history. */
  get transitionHistory(): readonly StateTransition<TState>[] {
    return this.history;
  }

  /** Returns the most recent transition, or null if none. */
  get lastTransition(): StateTransition<TState> | null {
    return this.history.length > 0 ? this.history[this.history.length - 1]! : null;
  }

  /**
   * Attempt a transition to the target state.
   * Returns true if the transition succeeded, false if it was rejected by a guard.
   * Throws if the transition is not in the valid transition map.
   */
  async transition(to: TState, reason: string): Promise<boolean> {
    const from = this._state;

    // 1. Validate transition is allowed
    const allowed = this.transitions[from];
    if (!allowed || !allowed.has(to)) {
      throw new Error(
        `Invalid state transition: ${String(from)} → ${String(to)}. ` +
          `Allowed transitions from ${String(from)}: ${Array.from(allowed ?? []).join(', ') || '(none)'}`,
      );
    }

    // 2. Run guards (all must pass)
    for (const guard of this.guards) {
      const allowed = await guard(from, to);
      if (!allowed) {
        return false;
      }
    }

    // 3. Execute transition
    this._state = to;
    const transition: StateTransition<TState> = { from, to, reason, timestamp: Date.now() };
    this.history.push(transition);

    // Trim history if needed
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    // 4. Notify observers
    this.onChange?.(from, to, reason);

    return true;
  }

  /**
   * Synchronous version of transition. Throws if any guard is async.
   */
  transitionSync(to: TState, reason: string): boolean {
    const from = this._state;

    const allowed = this.transitions[from];
    if (!allowed || !allowed.has(to)) {
      throw new Error(
        `Invalid state transition: ${String(from)} → ${String(to)}. ` +
          `Allowed transitions from ${String(from)}: ${Array.from(allowed ?? []).join(', ') || '(none)'}`,
      );
    }

    for (const guard of this.guards) {
      const result = guard(from, to);
      if (result instanceof Promise) {
        throw new Error('Cannot use sync transition with async guards');
      }
      if (!result) {
        return false;
      }
    }

    this._state = to;
    const transition: StateTransition<TState> = { from, to, reason, timestamp: Date.now() };
    this.history.push(transition);
    this.onChange?.(from, to, reason);

    return true;
  }

  /** Returns whether the machine is currently in the given state. */
  is(state: TState): boolean {
    return this._state === state;
  }

  /** Returns whether a transition from current state to the given state is valid. */
  canTransitionTo(to: TState): boolean {
    const allowed = this.transitions[this._state];
    return allowed !== undefined && allowed.has(to);
  }

  /** Reset the machine to a given state (bypasses guards, but validates transition exists). */
  reset(newState: TState, reason: string): void {
    // Record the PREVIOUS state as `from` (capture before overwriting
    // _state) — the old code read this._state after assignment, so the
    // history entry claimed from === to.
    const from = this._state;
    this._state = newState;
    this.history.push({ from, to: newState, reason, timestamp: Date.now() });
  }
}

/**
 * Pre-built state machine for bot lifecycle using BotState enum.
 */
export function createBotStateMachine(
  onChange?: StateChangeHandler<BotState>,
): StateMachine<BotState> {
  return new StateMachine<BotState>({
    initialState: BotState.Idle,
    transitions: BOT_STATE_TRANSITIONS,
    onChange,
  });
}
