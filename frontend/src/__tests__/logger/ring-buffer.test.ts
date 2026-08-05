import { describe, it, expect, beforeEach } from 'vitest';
import { RingBuffer } from '../../utils/logger/ring-buffer.js';

describe('RingBuffer', () => {
  let buffer: RingBuffer<number>;

  beforeEach(() => {
    buffer = new RingBuffer<number>(5);
  });

  describe('push and toArray', () => {
    it('stores and retrieves items in insertion order', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it('returns empty array when buffer is empty', () => {
      expect(buffer.toArray()).toEqual([]);
    });

    it('returns a single item correctly', () => {
      buffer.push(42);
      expect(buffer.toArray()).toEqual([42]);
    });
  });

  describe('overflow — oldest entry is discarded', () => {
    it('discards the oldest entry when capacity is exceeded', () => {
      for (let i = 1; i <= 5; i++) {
        buffer.push(i);
      }
      // Buffer is full (5 items)
      expect(buffer.toArray()).toEqual([1, 2, 3, 4, 5]);

      // Push one more — oldest (1) should be discarded
      buffer.push(6);
      expect(buffer.toArray()).toEqual([2, 3, 4, 5, 6]);
    });

    it('keeps the most recent 500 entries when maxSize is 500', () => {
      const large = new RingBuffer<string>(500);
      for (let i = 0; i < 501; i++) {
        large.push(`entry-${i}`);
      }
      const items = large.toArray();
      expect(items.length).toBe(500);
      expect(items[0]).toBe('entry-1');
      expect(items[499]).toBe('entry-500');
    });

    it('maintains correct size after overflow', () => {
      for (let i = 0; i < 10; i++) {
        buffer.push(i);
      }
      expect(buffer.size).toBe(5);
    });
  });

  describe('clear', () => {
    it('removes all items from the buffer', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.clear();
      expect(buffer.toArray()).toEqual([]);
      expect(buffer.size).toBe(0);
    });

    it('allows new items to be pushed after clearing', () => {
      buffer.push(1);
      buffer.clear();
      buffer.push(2);
      expect(buffer.toArray()).toEqual([2]);
    });
  });

  describe('size', () => {
    it('returns 0 for a new buffer', () => {
      expect(buffer.size).toBe(0);
    });

    it('increments with each push up to maxSize', () => {
      buffer.push(1);
      expect(buffer.size).toBe(1);
      buffer.push(2);
      expect(buffer.size).toBe(2);
    });

    it('stays at maxSize after overflow', () => {
      for (let i = 0; i < 10; i++) {
        buffer.push(i);
      }
      expect(buffer.size).toBe(5);
    });
  });

  describe('ordering after wrap-around', () => {
    it('returns items in correct insertion order after head wraps', () => {
      // Fill buffer to capacity
      for (let i = 0; i < 5; i++) {
        buffer.push(i);
      }
      // Overflow to wrap head around
      for (let i = 5; i < 8; i++) {
        buffer.push(i);
      }
      // Oldest remaining items are 3, 4, 5, 6, 7
      expect(buffer.toArray()).toEqual([3, 4, 5, 6, 7]);
    });
  });

  describe('custom maxSize', () => {
    it('respects a custom maxSize', () => {
      const small = new RingBuffer<string>(2);
      small.push('a');
      small.push('b');
      small.push('c');
      expect(small.toArray()).toEqual(['b', 'c']);
      expect(small.size).toBe(2);
    });
  });
});
