export interface PoolOptions<T> {
  initialSize: number;
  maxSize: number;
  factory: () => T;
  reset: (item: T) => void;
  validate?: (item: T) => boolean;
}

export class ObjectPool<T> {
  private pool: T[];
  private options: PoolOptions<T>;
  private totalCreated: number;
  private totalAcquired: number;
  private totalReleased: number;

  constructor(options: PoolOptions<T>) {
    this.options = options;
    this.pool = [];
    this.totalCreated = 0;
    this.totalAcquired = 0;
    this.totalReleased = 0;

    for (let i = 0; i < options.initialSize; i++) {
      this.pool.push(options.factory());
      this.totalCreated++;
    }
  }

  acquire(): T {
    let item: T | undefined;

    while (this.pool.length > 0) {
      item = this.pool.pop();
      if (this.options.validate && !this.options.validate(item as T)) {
        item = undefined;
        continue;
      }
      break;
    }

    if (!item) {
      if (this.totalCreated < this.options.maxSize) {
        item = this.options.factory();
        this.totalCreated++;
      } else {
        throw new Error('Pool exhausted: maximum size reached');
      }
    }

    this.totalAcquired++;
    return item as T;
  }

  release(item: T): void {
    if (this.pool.length < this.options.maxSize) {
      this.options.reset(item);
      this.pool.push(item);
      this.totalReleased++;
    }
  }

  get size(): number {
    return this.pool.length;
  }

  get available(): number {
    return this.pool.length;
  }

  get stats() {
    return {
      totalCreated: this.totalCreated,
      totalAcquired: this.totalAcquired,
      totalReleased: this.totalReleased,
      poolSize: this.pool.length,
      utilization:
        this.totalAcquired > 0
          ? ((this.totalAcquired - this.totalReleased) / this.totalAcquired) * 100
          : 0,
    };
  }

  clear(): void {
    this.pool = [];
  }
}

export class SeriesPool {
  private pool: ObjectPool<number[]>;

  constructor(initialSize: number = 100, maxSize: number = 10000) {
    this.pool = new ObjectPool<number[]>({
      initialSize,
      maxSize,
      factory: () => [],
      reset: (arr: number[]) => {
        arr.length = 0;
      },
    });
  }

  acquire(): number[] {
    return this.pool.acquire();
  }

  release(arr: number[]): void {
    this.pool.release(arr);
  }

  get stats() {
    return this.pool.stats;
  }
}

export class MapPool<K, V> {
  private pool: ObjectPool<Map<K, V>>;

  constructor(initialSize: number = 50, maxSize: number = 1000) {
    this.pool = new ObjectPool({
      initialSize,
      maxSize,
      factory: () => new Map(),
      reset: (map) => {
        map.clear();
      },
    });
  }

  acquire(): Map<K, V> {
    return this.pool.acquire();
  }

  release(map: Map<K, V>): void {
    this.pool.release(map);
  }

  get stats() {
    return this.pool.stats;
  }
}
