const MAX_ENTRIES = 500;

export class RingBuffer<T> {
  private buffer: (T | null)[];
  private head = 0;
  private count = 0;
  private readonly maxSize: number;

  constructor(maxSize: number = MAX_ENTRIES) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize).fill(null);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.maxSize;
    if (this.count < this.maxSize) {
      this.count++;
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    const start = this.count < this.maxSize ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.maxSize;
      const item = this.buffer[idx];
      if (item !== null) {
        result.push(item);
      }
    }
    return result;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.buffer.fill(null);
  }

  get size(): number {
    return this.count;
  }
}
