/**
 * Cooperative-cancellation registry (B2 — blocking-computation fix).
 *
 * WHY THIS EXISTS: removing a long-computing indicator must cancel its
 * computation and take effect promptly (user intent), and the API must stay
 * responsive while a run computes. B1 made the engine's bar loop yield to the
 * event loop every 50 bars and check an optional CancellationToken at each
 * yield. This registry is the BACKEND side of that seam: it hands out tokens
 * keyed by run/indicator id, lets DELETE /api/indicators/:id and WS
 * stop_indicator flag them, and guarantees entries are cleaned up so a long
 * session of compute+cancel cycles never leaks token objects.
 *
 * DI (architecture law): constructed ONCE at the composition root
 * (backend/src/index.ts) and injected into the routers/gateway that need it.
 * No singleton, no global — consumers receive the interface, never construct
 * a registry themselves.
 *
 * TOKEN TYPE: structurally identical to the engine's CancellationToken
 * (src/language/runtime/execution-types.ts, re-exported from
 * execution-engine.ts). The backend package cannot deep-import the framework
 * barrel's runtime types (package.json exports has no runtime subpath), so the
 * contract is re-declared here — TypeScript's structural typing makes registry
 * tokens assignable to the engine's CancellationToken at every call site.
 * Mutable internals stay private to the registry; consumers only ever see the
 * readonly view.
 */
export interface CancellationToken {
  readonly isCancelled: boolean;
}

/** Narrow surface the routers/gateway depend on (Interface Segregation). */
export interface CancellationRegistry {
  /**
   * Create a fresh token for `id`. Supersedes any in-flight run keyed by the
   * same id — the previous token is flagged cancelled so a stale run stops at
   * its next yield instead of racing the new one.
   */
  create(id: string): CancellationToken;
  /** Read the current token for `id` (undefined when no run is registered). */
  get(id: string): CancellationToken | undefined;
  /**
   * Flag the token for `id` as cancelled. Idempotent: cancelling an id with no
   * registered token (already removed, or never created) is a silent no-op.
   */
  cancel(id: string): void;
  /**
   * Forget `id`. Callers MUST invoke this in a finally block so entries never
   * leak across the run's lifetime (no leaks on success, error, or cancel).
   */
  remove(id: string): void;
}

export class InMemoryCancellationRegistry implements CancellationRegistry {
  private readonly tokens = new Map<string, { isCancelled: boolean }>();

  create(id: string): CancellationToken {
    const previous = this.tokens.get(id);
    if (previous) {
      // A new run for this id invalidates any run still in flight under it.
      previous.isCancelled = true;
    }
    const token = { isCancelled: false };
    this.tokens.set(id, token);
    return token;
  }

  get(id: string): CancellationToken | undefined {
    return this.tokens.get(id);
  }

  cancel(id: string): void {
    const token = this.tokens.get(id);
    if (token) {
      token.isCancelled = true;
    }
  }

  remove(id: string): void {
    this.tokens.delete(id);
  }
}
