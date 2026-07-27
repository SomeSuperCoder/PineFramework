import { describe, it, expect, vi } from 'vitest';
import { StateMachine } from '../../../src/trading/state-machine.js';
import { BotState, BOT_STATE_TRANSITIONS } from '../../../src/trading/types.js';

describe('StateMachine', () => {
  it('should start in the initial state', () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
    });
    expect(sm.state).toBe(BotState.Idle);
  });

  it('should transition to a valid state', async () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
    });

    const result = await sm.transition(BotState.Starting, 'Starting test');
    expect(result).toBe(true);
    expect(sm.state).toBe(BotState.Starting);
  });

  it('should throw on invalid transition', async () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
    });

    await expect(sm.transition(BotState.Running, 'Jump ahead')).rejects.toThrow(
      'Invalid state transition',
    );
  });

  it('should reject transition when guard returns false', async () => {
    const guard = vi.fn().mockReturnValue(false);
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
      guards: [guard],
    });

    const result = await sm.transition(BotState.Starting, 'Guard test');
    expect(result).toBe(false);
    expect(sm.state).toBe(BotState.Idle);
    expect(guard).toHaveBeenCalledWith(BotState.Idle, BotState.Starting);
  });

  it('should support async guards', async () => {
    const guard = vi.fn().mockResolvedValue(true);
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
      guards: [guard],
    });

    const result = await sm.transition(BotState.Starting, 'Async guard');
    expect(result).toBe(true);
    expect(sm.state).toBe(BotState.Starting);
  });

  it('should call onChange handler on successful transition', async () => {
    const onChange = vi.fn();
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
      onChange,
    });

    await sm.transition(BotState.Starting, 'Change handler test');
    expect(onChange).toHaveBeenCalledWith(BotState.Idle, BotState.Starting, 'Change handler test');
  });

  it('should record transition history', async () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
      onChange: () => {},
    });

    await sm.transition(BotState.Starting, 'Reason 1');
    await sm.transition(BotState.Running, 'Reason 2');

    const history = sm.transitionHistory;
    expect(history).toHaveLength(2);
    expect(history[0]!.from).toBe(BotState.Idle);
    expect(history[0]!.to).toBe(BotState.Starting);
    expect(history[0]!.reason).toBe('Reason 1');
    expect(history[1]!.from).toBe(BotState.Starting);
    expect(history[1]!.to).toBe(BotState.Running);
    expect(history[1]!.reason).toBe('Reason 2');
  });

  it('should have timestamps in transition history', async () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
    });

    const before = Date.now();
    await sm.transition(BotState.Starting, 'Timestamp test');
    const after = Date.now();

    expect(sm.lastTransition!.timestamp).toBeGreaterThanOrEqual(before);
    expect(sm.lastTransition!.timestamp).toBeLessThanOrEqual(after);
  });

  it('should support sync transitions', () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
    });

    const result = sm.transitionSync(BotState.Starting, 'Sync');
    expect(result).toBe(true);
    expect(sm.state).toBe(BotState.Starting);
  });

  it('should throw on sync transition with async guards', () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
      guards: [async () => true],
    });

    expect(() => sm.transitionSync(BotState.Starting, 'Sync with async guard')).toThrow(
      'Cannot use sync transition with async guards',
    );
  });

  it('should report canTransitionTo correctly', () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
    });

    expect(sm.canTransitionTo(BotState.Starting)).toBe(true);
    expect(sm.canTransitionTo(BotState.Running)).toBe(false);
    expect(sm.canTransitionTo(BotState.Error)).toBe(true);
  });

  it('should support the is() method', () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
    });

    expect(sm.is(BotState.Idle)).toBe(true);
    expect(sm.is(BotState.Running)).toBe(false);
  });

  it('should trim history when exceeding maxHistory', async () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: {
        [BotState.Idle]: new Set([BotState.Starting, BotState.Error]),
        [BotState.Starting]: new Set([BotState.Idle, BotState.Running, BotState.Error]),
        [BotState.Running]: new Set([BotState.Stopping, BotState.Error]),
        [BotState.Stopping]: new Set([BotState.Stopped, BotState.Error]),
        [BotState.Stopped]: new Set([BotState.Idle, BotState.Starting, BotState.Error]),
        [BotState.Error]: new Set([BotState.Stopped]),
      },
    }, 3);

    await sm.transition(BotState.Starting, '1');
    await sm.transition(BotState.Idle, '2');
    await sm.transition(BotState.Starting, '3');
    await sm.transition(BotState.Idle, '4');

    expect(sm.transitionHistory.length).toBeLessThanOrEqual(3);
  });

  it('should handle the full bot lifecycle', async () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
    });

    // Full cycle: Idle → Starting → Running → Stopping → Stopped → Idle
    await sm.transition(BotState.Starting, 'Start');
    await sm.transition(BotState.Running, 'Running');
    await sm.transition(BotState.Stopping, 'Stop');
    await sm.transition(BotState.Stopped, 'Stopped');
    await sm.transition(BotState.Idle, 'Reset');

    expect(sm.state).toBe(BotState.Idle);
  });

  it('should handle error recovery path', async () => {
    const sm = new StateMachine({
      initialState: BotState.Idle,
      transitions: BOT_STATE_TRANSITIONS,
    });

    await sm.transition(BotState.Starting, 'Start');
    await sm.transition(BotState.Error, 'Fatal error');
    await sm.transition(BotState.Stopped, 'Acknowledged');

    expect(sm.state).toBe(BotState.Stopped);
  });
});
