/**
 * RingBuffer — O(1) push-and-evict sliding window.
 * Replaces Array.push() / shift() patterns that are O(n).
 *
 * The underlying array is lazily allocated on the first push() call,
 * avoiding wasted memory for buffers that are created but never used.
 */
export class RingBuffer {
  private buffer: number[] | null = null;
  private capacity: number;
  private head: number = 0;
  private size: number = 0;
  private sum: number = 0;
  private pushCount: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    // Buffer is lazily allocated in push()
  }

  push(value: number): void {
    if (this.buffer === null) {
      this.buffer = new Array(this.capacity);
    }
    if (this.size === this.capacity) {
      // Overwrite oldest value
      this.sum -= this.buffer[this.head];
      this.buffer[this.head] = value;
      this.sum += value;
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.buffer[this.head] = value;
      this.sum += value;
      this.head = (this.head + 1) % this.capacity;
      this.size++;
    }
    // Periodically recompute sum from scratch to correct IEEE 754 drift
    this.pushCount++;
    if (this.pushCount >= this.capacity * 10) {
      this.pushCount = 0;
      this.recalcSum();
    }
  }

  /** Recompute running sum from buffer contents to correct floating-point drift. */
  private recalcSum(): void {
    if (this.size === 0) {
      this.sum = 0;
      return;
    }
    const buf = this.buffer!;
    let s = 0;
    if (this.size < this.capacity) {
      for (let i = 0; i < this.size; i++) {
        s += buf[i];
      }
    } else {
      for (let i = 0; i < this.capacity; i++) {
        s += buf[(this.head + i) % this.capacity];
      }
    }
    this.sum = s;
  }

  getSize(): number {
    return this.size;
  }

  getSum(): number {
    return this.sum;
  }

  getCapacity(): number {
    return this.capacity;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
    this.sum = 0;
    this.buffer = null;
  }

  toArray(): number[] {
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

  static fromArray(arr: number[], capacity: number): RingBuffer {
    const rb = new RingBuffer(capacity);
    for (const v of arr) {
      rb.push(v);
    }
    return rb;
  }
}
