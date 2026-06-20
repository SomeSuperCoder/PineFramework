import { VERSION } from '../src/index.js';

describe('project setup', () => {
  it('exports version', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
