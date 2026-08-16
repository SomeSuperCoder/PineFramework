import { Decimal } from 'decimal.js';

/**
 * DecimalRingBuffer — O(1) push-and-evict sliding window with an EXACT running
 * sum. Decimal-typed sibling of RingBuffer (ring-buffer.ts), created for the
 * TA decimal migration: `ta.sma(0.1, 10)` must equal 0.1 exactly (fp-final-gate),
 * which a number-based running sum cannot guarantee across thousands of pushes
 * (IEEE 754 drift).
 *
 * Contract §2.2 seam: values stay Decimal through the ENTIRE accumulation —
 * no Number round-trip anywhere in this class. Callers convert at their own
 * boundary (decimal-convert.ts) after reading getSum()/toArray().
 *
 * WHY no recalcSum(): RingBuffer periodically recomputes its sum from the
 * buffer to correct floating-point drift. The configured global Decimal
 * (DP=20, ROUND_HALF_UP — decimal-config.ts) makes every plus/minus EXACT, so
 * a running sum accumulated via plus/minus can NEVER drift — the recalc was a
 * float-drift hack and is deliberately omitted here.
 */
export class DecimalRingBuffer {
  private buffer: Decimal[] | null = null;
  private capacity: number;
  private head: number = 0;
  private size: number = 0;
  private sum: Decimal = new Decimal(0);

  constructor(capacity: number) {
    this.capacity = capacity;
    // Buffer is lazily allocated in push()
  }

  push(value: Decimal): void {
    if (this.buffer === null) {
      this.buffer = new Array(this.capacity);
    }
    if (this.size === this.capacity) {
      // Overwrite oldest value: subtract the evicted value BEFORE overwriting
      // (same order as RingBuffer). Each minus/plus is exact at DP=20.
      this.sum = this.sum.minus(this.buffer[this.head]);
      this.buffer[this.head] = value;
      this.sum = this.sum.plus(value);
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.buffer[this.head] = value;
      this.sum = this.sum.plus(value);
      this.head = (this.head + 1) % this.capacity;
      this.size++;
    }
  }

  getSize(): number {
    return this.size;
  }

  /** Running sum as a Decimal — callers convert at their boundary (§2.2). */
  getSum(): Decimal {
    return this.sum;
  }

  getCapacity(): number {
    return this.capacity;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
    this.sum = new Decimal(0);
    this.buffer = null;
  }

  /** Snapshot of the window, ordered oldest → newest. */
  toArray(): Decimal[] {
    if (this.size === 0) return [];
    // buffer is guaranteed to be non-null when size > 0
    const buf = this.buffer!;
    if (this.size < this.capacity) {
      return buf.slice(0, this.size);
    }
    // Buffer is full, need to reconstruct in order
    const result = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      result[i] = buf[(this.head + i) % this.capacity];
    }
    return result;
  }

  static fromArray(arr: Decimal[], capacity: number): DecimalRingBuffer {
    const rb = new DecimalRingBuffer(capacity);
    for (const v of arr) {
      rb.push(v);
    }
    return rb;
  }
}
