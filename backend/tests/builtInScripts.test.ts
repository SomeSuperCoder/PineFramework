import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createBuiltInScriptsRouter } from '../src/routes/builtInScripts.js';

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `built-in-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function mockReq(method: string, url: string): any {
  return { method, url, query: {} };
}

function mockRes(): any {
  return {
    _json: null,
    _status: 200,
    status(code: number) { this._status = code; return this; },
    json(data: unknown) { this._json = data; },
  };
}

describe('createBuiltInScriptsRouter', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an Express Router', () => {
    const router = createBuiltInScriptsRouter(dir);
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });

  it('returns empty array when no .pine files exist', () => {
    const router = createBuiltInScriptsRouter(dir);
    const res = mockRes();
    router.handle(mockReq('GET', '/scripts/built-in'), res);
    expect(res._status).toBe(200);
    expect(res._json.scripts).toEqual([]);
  });

  it('returns scripts from .pine files', () => {
    fs.writeFileSync(path.join(dir, 'macd.pine'), '//@version=6\nindicator("MACD")');
    fs.writeFileSync(path.join(dir, 'rsi.pine'), '//@version=6\nindicator("RSI")');

    const router = createBuiltInScriptsRouter(dir);
    const res = mockRes();
    router.handle(mockReq('GET', '/scripts/built-in'), res);
    expect(res._status).toBe(200);
    expect(res._json.scripts).toHaveLength(2);
  });

  it('generates correct id with builtin_ prefix', () => {
    fs.writeFileSync(path.join(dir, 'macd.pine'), '//@version=6\nindicator("MACD")');

    const router = createBuiltInScriptsRouter(dir);
    const res = mockRes();
    router.handle(mockReq('GET', '/scripts/built-in'), res);
    expect(res._json.scripts[0].id).toBe('builtin_macd');
  });

  it('extracts name from filename', () => {
    fs.writeFileSync(path.join(dir, 'my-indicator.pine'), '//@version=6\nindicator("My Indicator")');

    const router = createBuiltInScriptsRouter(dir);
    const res = mockRes();
    router.handle(mockReq('GET', '/scripts/built-in'), res);
    expect(res._json.scripts[0].name).toBe('my-indicator');
  });

  it('detects indicator type', () => {
    fs.writeFileSync(path.join(dir, 'test.pine'), '//@version=6\nindicator("Test")');

    const router = createBuiltInScriptsRouter(dir);
    const res = mockRes();
    router.handle(mockReq('GET', '/scripts/built-in'), res);
    expect(res._json.scripts[0].type).toBe('indicator');
  });

  it('detects strategy type', () => {
    fs.writeFileSync(path.join(dir, 'test.pine'), '//@version=6\nstrategy("Test")');

    const router = createBuiltInScriptsRouter(dir);
    const res = mockRes();
    router.handle(mockReq('GET', '/scripts/built-in'), res);
    expect(res._json.scripts[0].type).toBe('strategy');
  });

  it('returns full source content', () => {
    const source = '//@version=6\nindicator("Test")\nplot(close)';
    fs.writeFileSync(path.join(dir, 'test.pine'), source);

    const router = createBuiltInScriptsRouter(dir);
    const res = mockRes();
    router.handle(mockReq('GET', '/scripts/built-in'), res);
    expect(res._json.scripts[0].source).toBe(source);
  });

  it('ignores non-.pine files', () => {
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'This is not a script');
    fs.writeFileSync(path.join(dir, 'test.pine'), '//@version=6\nindicator("Test")');

    const router = createBuiltInScriptsRouter(dir);
    const res = mockRes();
    router.handle(mockReq('GET', '/scripts/built-in'), res);
    expect(res._json.scripts).toHaveLength(1);
  });

  it('returns 500 when directory does not exist', () => {
    const router = createBuiltInScriptsRouter('/nonexistent/path');
    const res = mockRes();
    router.handle(mockReq('GET', '/scripts/built-in'), res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBeDefined();
  });
});
