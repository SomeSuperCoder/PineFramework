/**
 * SensitiveData — secure wrapper for secrets in memory.
 *
 * Provides:
 * - Zero-fill on dispose (Buffer.alloc to prevent residual data)
 * - Guard against JSON serialization
 * - Never included in error messages or logs
 * - Auto-dispose via try/finally pattern
 *
 * @module trading
 */

/**
 * Wraps a sensitive value and ensures it is:
 * 1. Never JSON-serialized
 * 2. Zeroed on dispose()
 * 3. Not included in string representations
 */
export class SensitiveData<T extends { dispose?: () => void; toString?: () => string }> {
  private _value: T | null;
  private _disposed = false;

  constructor(value: T) {
    this._value = value;
  }

  /** Access the underlying value. Throws if disposed. */
  get value(): T {
    if (this._disposed || !this._value) {
      throw new Error('SensitiveData has been disposed');
    }
    return this._value;
  }

  /** Returns whether the data has been disposed. */
  get isDisposed(): boolean {
    return this._disposed;
  }

  /**
   * Dispose of the sensitive data — zero-fills buffers and clears references.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    const v = this._value;
    if (v) {
      // Zero-fill Buffer if present
      if (Buffer.isBuffer(v)) {
        v.fill(0);
      }
      // Call custom dispose if available
      if (typeof v.dispose === 'function') {
        try {
          v.dispose();
        } catch {
          // Best-effort
        }
      }
    }
    (this as unknown as Record<string, unknown>)._value = null;
  }

  /**
   * Execute a callback with the sensitive value and auto-dispose afterward.
   * Ensures the value is wiped even if the callback throws.
   */
  use<R>(fn: (value: T) => R): R {
    try {
      return fn(this.value);
    } finally {
      this.dispose();
    }
  }

  /** Prevent JSON serialization of the raw value. */
  toJSON(): Record<string, never> {
    return { __sensitive__: true };
  }

  /** Prevent accidental string inclusion in logs. */
  toString(): string {
    return '[SensitiveData]';
  }

  /** Prevent value inspection in console. */
  get [Symbol.toStringTag](): string {
    return 'SensitiveData';
  }

  /**
   * Create a SensitiveData from a string (stored as Buffer for zero-fill capability).
   */
  static fromString(value: string): SensitiveData<Buffer> {
    return new SensitiveData(Buffer.alloc(value.length, value, 'utf-8'));
  }

  /**
   * Create a SensitiveData from a Buffer.
   */
  static fromBuffer(value: Buffer): SensitiveData<Buffer> {
    return new SensitiveData(value);
  }
}
