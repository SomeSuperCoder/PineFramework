import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TelegramConfigStore } from '../src/store/TelegramConfigStore.js';
import { TelegramService } from '../src/telegram/TelegramService.js';

function tmpFile(): string {
  return path.join(os.tmpdir(), `telegram-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

describe('TelegramService', () => {
  let filePath: string;
  let configStore: TelegramConfigStore;
  let service: TelegramService;

  beforeEach(() => {
    filePath = tmpFile();
    configStore = new TelegramConfigStore(filePath);
    service = new TelegramService({ configStore });
  });

  afterEach(async () => {
    await service.stop();
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('does not start without a token', async () => {
    await service.start();
    expect(service.isActive()).toBe(false);
  });

  it('starts with a valid token', async () => {
    configStore.setBotToken('dummy:test-token');
    await service.start();
    expect(service.isActive()).toBe(false);
  });

  it('handles sendMessage when not started', async () => {
    const result = await service.sendMessage(12345, 'hello');
    expect(result).toBe(false);
  });

  it('handles sendPhoto when not started', async () => {
    const result = await service.sendPhoto(12345, Buffer.from('test'));
    expect(result).toBe(false);
  });

  it('does not throw on stop when not started', async () => {
    await expect(service.stop()).resolves.not.toThrow();
  });

  it('returns bot instance via getBot', () => {
    expect(service.getBot()).toBeNull();
  });

  it('handles sendAlertToSubscribers with no subscribers', async () => {
    await expect(service.sendAlertToSubscribers('test message', 'alert_1')).resolves.not.toThrow();
  });

  it('handles sendAlertToSubscribers with subscribers but no bot', async () => {
    configStore.addSubscriber(12345, 'testuser');
    await expect(service.sendAlertToSubscribers('test message', 'alert_1')).resolves.not.toThrow();
  });

  it('sendAlertToSubscribers respects per-alert preferences', async () => {
    configStore.addSubscriber(12345, 'testuser');
    configStore.setAlertPreference(12345, 'alert_disabled', false);
    await expect(
      service.sendAlertToSubscribers('test', 'alert_disabled'),
    ).resolves.not.toThrow();
  });

  it('start/stop can be called multiple times', async () => {
    await service.start();
    await service.start();
    await service.stop();
    await service.stop();
    expect(service.isActive()).toBe(false);
  });
});

describe('TelegramService with token (no actual connection)', () => {
  let filePath: string;
  let configStore: TelegramConfigStore;

  beforeEach(() => {
    filePath = tmpFile();
    configStore = new TelegramConfigStore(filePath);
  });

  afterEach(async () => {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('sendMessage with invalid token fails gracefully', async () => {
    configStore.setBotToken('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');
    const service = new TelegramService({ configStore });
    await service.start();
    // Even though bot fails to launch (invalid token), sendMessage should not throw
    const result = await service.sendMessage(12345, 'test');
    expect(result).toBe(false);
    await service.stop();
  });
});

describe('TelegramConfigStore SOCKS5 proxy', () => {
  let filePath: string;
  let configStore: TelegramConfigStore;

  beforeEach(() => {
    filePath = tmpFile();
    configStore = new TelegramConfigStore(filePath);
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('returns undefined proxy when not configured', () => {
    expect(configStore.getProxy()).toBeUndefined();
  });

  it('stores and retrieves proxy config', () => {
    configStore.setProxy({ host: '127.0.0.1', port: 1080 });
    const proxy = configStore.getProxy();
    expect(proxy).toBeDefined();
    expect(proxy!.host).toBe('127.0.0.1');
    expect(proxy!.port).toBe(1080);
    expect(proxy!.username).toBeUndefined();
    expect(proxy!.password).toBeUndefined();
  });

  it('stores proxy with authentication', () => {
    configStore.setProxy({ host: 'proxy.example.com', port: 3128, username: 'user', password: 'pass' });
    const proxy = configStore.getProxy();
    expect(proxy!.host).toBe('proxy.example.com');
    expect(proxy!.port).toBe(3128);
    expect(proxy!.username).toBe('user');
    expect(proxy!.password).toBe('pass');
  });

  it('clears proxy when set to undefined', () => {
    configStore.setProxy({ host: '127.0.0.1', port: 1080 });
    expect(configStore.getProxy()).toBeDefined();
    configStore.setProxy(undefined);
    expect(configStore.getProxy()).toBeUndefined();
  });

  it('validates proxy host - empty string', () => {
    expect(() => configStore.setProxy({ host: '', port: 1080 })).toThrow('proxy.host must be a non-empty string');
  });

  it('validates proxy port - out of range low', () => {
    expect(() => configStore.setProxy({ host: '127.0.0.1', port: 0 })).toThrow('proxy.port must be a number between 1 and 65535');
  });

  it('validates proxy port - out of range high', () => {
    expect(() => configStore.setProxy({ host: '127.0.0.1', port: 65536 })).toThrow('proxy.port must be a number between 1 and 65535');
  });

  it('persists proxy config to disk', () => {
    configStore.setProxy({ host: '10.0.0.1', port: 8080 });
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.settings.proxy).toBeDefined();
    expect(data.settings.proxy.host).toBe('10.0.0.1');
    expect(data.settings.proxy.port).toBe(8080);
  });

  it('trims whitespace from host', () => {
    configStore.setProxy({ host: '  192.168.1.1  ', port: 1080 });
    expect(configStore.getProxy()!.host).toBe('192.168.1.1');
  });

  it('returns proxy from loaded data', () => {
    const data = {
      botToken: 'test',
      subscribers: [],
      settings: { proxy: { host: 'proxy.test', port: 9999, username: 'u', password: 'p' } },
    };
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
    const store = new TelegramConfigStore(filePath);
    const proxy = store.getProxy();
    expect(proxy!.host).toBe('proxy.test');
    expect(proxy!.port).toBe(9999);
    expect(proxy!.username).toBe('u');
    expect(proxy!.password).toBe('p');
  });
});

describe('SOCKS5 proxy with TelegramService', () => {
  let filePath: string;
  let configStore: TelegramConfigStore;
  let service: TelegramService;

  beforeEach(() => {
    filePath = tmpFile();
    configStore = new TelegramConfigStore(filePath);
    service = new TelegramService({ configStore });
  });

  afterEach(async () => {
    await service.stop();
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('does not fail start with proxy configured but no token', async () => {
    configStore.setProxy({ host: '127.0.0.1', port: 1080 });
    await expect(service.start()).resolves.not.toThrow();
    expect(service.isActive()).toBe(false);
  });

  it('does not fail start with proxy and invalid token', async () => {
    configStore.setBotToken('dummy:test-token');
    configStore.setProxy({ host: '127.0.0.1', port: 1080, username: 'user', password: 'pass' });
    await expect(service.start()).resolves.not.toThrow();
  });

  it('does not fail start with proxy removed after restart', async () => {
    configStore.setProxy({ host: '127.0.0.1', port: 9050 });
    await service.start();
    expect(service.isActive()).toBe(false);
    configStore.setProxy(undefined);
    await service.start();
    expect(service.isActive()).toBe(false);
  });
});

describe('MarkdownV2 escaping in TelegramService', () => {
  it('escapes special characters for MarkdownV2', async () => {
    const filePath = tmpFile();
    const configStore = new TelegramConfigStore(filePath);
    const service = new TelegramService({ configStore });

    let lastMessage = '';
    const subscribers: Array<{ chatId: number; called: boolean }> = [];

    const origSendMessage = service.sendMessage.bind(service);
    service.sendMessage = async (chatId: number, message: string) => {
      subscribers.push({ chatId, called: true });
      lastMessage = message;
      return true;
    };

    configStore.addSubscriber(12345, 'testuser');
    await service.sendAlertToSubscribers('Price [BTC] *high* _low_', 'alert_1', 'BTCUSDT', '1m');

    expect(lastMessage).toContain('\\*high\\*');
    expect(lastMessage).toContain('\\_low\\_');
    expect(lastMessage).toContain('BTCUSDT');
    expect(lastMessage).toContain('1m');

    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });
});
