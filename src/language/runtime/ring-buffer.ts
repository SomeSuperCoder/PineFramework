/**
 * RingBuffer — O(1) push-and-evict sliding window.
 * Replaces Array.push() / shift() patterns that are O(n).
 */
export class RingBuffer {
  private buffer: number[];
  private capacity: number;
  private head: number = 0;
  private size: number = 0;
  private sum: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(value: number): void {
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
  }

  toArray(): number[] {
    if (this.size === 0) return [];
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    // Buffer is full, need to reconstruct in order
    const result = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      result[i] = this.buffer[(this.head + i) % this.capacity];
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
