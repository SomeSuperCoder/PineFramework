import { Router } from 'express';
import {
  NOTIFICATION_TYPES,
  type ChatLanguage,
  type NotificationType,
  type ProxyConfig,
  type TelegramAdmin,
  type TelegramChat,
  type TelegramController,
  type TelegramControlRequest,
} from '../store/TelegramConfigStore.js';

/**
 * Dependencies the settings control-panel router needs from the Telegram
 * config store. The legacy `getSubscribers` dependency was removed: the
 * pre-chat subscriber model is superseded by the admin/controllers/requests/
 * chats model, and GET /settings/telegram now returns the new structure.
 */
interface SettingsDeps {
  // -- existing (byte-identical contracts preserved) --
  getBotToken: () => string;
  setBotToken: (token: string) => void;
  getAlertPreference: (chatId: number, alertId: string) => boolean;
  setAlertPreference: (chatId: number, alertId: string, enabled: boolean) => void;
  getProxy: () => ProxyConfig | undefined;
  setProxy: (proxy: ProxyConfig | undefined) => void;
  // -- admin --
  getAdmin: () => TelegramAdmin | undefined;
  setAdmin: (userId: number, username: string) => void;
  // -- controllers --
  getControllers: () => TelegramController[];
  addController: (userId: number, username: string, grantedBy: number) => boolean;
  removeController: (userId: number) => boolean;
  // -- control requests --
  getRequests: () => TelegramControlRequest[];
  removeRequest: (userId: number) => boolean;
  // -- chats / memberships --
  getChats: () => TelegramChat[];
  setChatLanguage: (chatId: number, lang: ChatLanguage) => void;
  setMemberSubscriptions: (
    chatId: number,
    memberId: number,
    types: NotificationType[],
  ) => void;
  linkChat: (chatId: number, byUserId: number) => boolean;
  unlinkChat: (chatId: number) => boolean;
}

const CHAT_LANGUAGES: readonly ChatLanguage[] = ['en', 'es', 'ru'];

/**
 * Parses and validates a route `:id` param as ANY signed integer. Group
 * Telegram chatIds are negative, so `:chatId`/`:memberId` params must accept
 * negatives (B3). User ids (controllers/requests/admin) are never negative and
 * go through `parseUserIdParam` instead.
 */
function parseIdParam(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  return n;
}

/**
 * Parses a route `:userId` param as a NON-negative integer. Negative ids are
 * invalid as user identity; this is separate from `parseIdParam` (signed).
 */
function parseUserIdParam(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export function createSettingsRouter(deps: SettingsDeps): Router {
  const router = Router();

  router.get('/settings/telegram', (_req, res) => {
    const botToken = deps.getBotToken();
    const admin = deps.getAdmin();
    res.json({
      botToken,
      admin: admin ? { userId: admin.userId, username: admin.username } : null,
      controllers: deps.getControllers(),
      requests: deps.getRequests(),
      chats: deps.getChats(),
    });
  });

  router.put('/settings/telegram', (req, res) => {
    try {
      const { botToken } = req.body as { botToken?: string };
      if (botToken !== undefined) {
        if (typeof botToken !== 'string') {
          res.status(400).json({ error: 'botToken must be a string' });
          return;
        }
        deps.setBotToken(botToken);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update settings' });
    }
  });

  router.get('/settings/alerts/:id/telegram', (req, res) => {
    try {
      const alertId = req.params.id;
      const chatId = req.query.chatId ? parseInt(req.query.chatId as string, 10) : 0;
      const enabled = deps.getAlertPreference(chatId, alertId);
      res.json({ alertId, enabled });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get alert preference' });
    }
  });

  router.put('/settings/alerts/:id/telegram', (req, res) => {
    try {
      const alertId = req.params.id;
      const chatId = req.query.chatId ? parseInt(req.query.chatId as string, 10) : 0;
      const { enabled } = req.body as { enabled?: boolean };
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }
      deps.setAlertPreference(chatId, alertId, enabled);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update alert preference' });
    }
  });

  router.get('/settings/telegram/proxy', (_req, res) => {
    try {
      const proxy = deps.getProxy();
      if (proxy) {
        res.json({
          host: proxy.host,
          port: proxy.port,
          username: proxy.username || '',
        });
      } else {
        res.json(null);
      }
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get proxy settings' });
    }
  });

  router.put('/settings/telegram/proxy', (req, res) => {
    try {
      const proxy = req.body as ProxyConfig | null;
      if (proxy === null || proxy === undefined) {
        deps.setProxy(undefined);
        res.json({ success: true });
        return;
      }
      if (typeof proxy.host !== 'string' || proxy.host.trim() === '') {
        res.status(400).json({ error: 'host must be a non-empty string' });
        return;
      }
      if (typeof proxy.port !== 'number' || proxy.port <= 0 || proxy.port > 65535) {
        res.status(400).json({ error: 'port must be a number between 1 and 65535' });
        return;
      }
      deps.setProxy({
        host: proxy.host.trim(),
        port: proxy.port,
        username: proxy.username || undefined,
        password: proxy.password || undefined,
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update proxy settings' });
    }
  });

  // ---- Admin --------------------------------------------------------------

  router.get('/settings/telegram/admin', (_req, res) => {
    try {
      const admin = deps.getAdmin();
      res.json({
        success: true,
        admin: admin ? { userId: admin.userId, username: admin.username } : null,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get admin' });
    }
  });

  router.put('/settings/telegram/admin', (req, res) => {
    try {
      const { userId, username } = req.body as { userId?: unknown; username?: string };
      if (typeof userId !== 'number' || !Number.isInteger(userId)) {
        res.status(400).json({ error: 'userId must be a number' });
        return;
      }
      deps.setAdmin(userId, typeof username === 'string' ? username : '');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update admin' });
    }
  });

  // ---- Controllers --------------------------------------------------------

  router.get('/settings/telegram/controllers', (_req, res) => {
    try {
      res.json({ success: true, controllers: deps.getControllers() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get controllers' });
    }
  });

  router.delete('/settings/telegram/controllers/:userId', (req, res) => {
    try {
      const userId = parseUserIdParam(req.params.userId);
      if (userId === null) {
        res.status(400).json({ error: 'userId must be a number' });
        return;
      }
      const removed = deps.removeController(userId);
      res.json({ success: true, removed });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to remove controller' });
    }
  });

  // ---- Control requests ---------------------------------------------------

  router.get('/settings/telegram/requests', (_req, res) => {
    try {
      res.json({ success: true, requests: deps.getRequests() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get requests' });
    }
  });

  router.post('/settings/telegram/requests/:userId/approve', (req, res) => {
    try {
      const userId = parseUserIdParam(req.params.userId);
      if (userId === null) {
        res.status(400).json({ error: 'userId must be a number' });
        return;
      }
      // Resolve the requesting user's username from the request record (it is
      // what the bot persisted when the /request command fired); fall back to
      // the numeric id so the controller record stays well-formed.
      const request = deps.getRequests().find((r) => r.userId === userId);
      if (request === undefined) {
        // H1: never grant a controller without a pending /request — this would
        // bypass the operator-approval whitelist entirely.
        res.status(404).json({ error: 'No pending request for this user' });
        return;
      }
      const username = request.username ?? String(userId);
      deps.removeRequest(userId);
      const admin = deps.getAdmin();
      const added = deps.addController(userId, username, admin?.userId ?? 0);
      res.json({ success: true, added });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to approve request' });
    }
  });

  router.post('/settings/telegram/requests/:userId/deny', (req, res) => {
    try {
      const userId = parseUserIdParam(req.params.userId);
      if (userId === null) {
        res.status(400).json({ error: 'userId must be a number' });
        return;
      }
      const removed = deps.removeRequest(userId);
      res.json({ success: true, removed });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to deny request' });
    }
  });

  // ---- Chats --------------------------------------------------------------

  router.get('/settings/telegram/chats', (_req, res) => {
    try {
      res.json({ success: true, chats: deps.getChats() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get chats' });
    }
  });

  router.put('/settings/telegram/chats/:chatId/language', (req, res) => {
    try {
      const chatId = parseIdParam(req.params.chatId);
      if (chatId === null) {
        res.status(400).json({ error: 'chatId must be a number' });
        return;
      }
      const { language } = req.body as { language?: unknown };
      if (
        typeof language !== 'string' ||
        !CHAT_LANGUAGES.includes(language as ChatLanguage)
      ) {
        res.status(400).json({ error: 'language must be one of en, es, ru' });
        return;
      }
      deps.setChatLanguage(chatId, language as ChatLanguage);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update chat language' });
    }
  });

  router.put('/settings/telegram/chats/:chatId/subscriptions/:memberId', (req, res) => {
    try {
      const chatId = parseIdParam(req.params.chatId);
      const memberId = parseIdParam(req.params.memberId);
      if (chatId === null || memberId === null) {
        res.status(400).json({ error: 'chatId and memberId must be numbers' });
        return;
      }
      const { types } = req.body as { types?: unknown };
      const valid = (NOTIFICATION_TYPES as readonly string[]);
      if (
        !Array.isArray(types) ||
        !types.every((t) => typeof t === 'string' && valid.includes(t))
      ) {
        res.status(400).json({
          error: 'types must be an array of valid notification types',
        });
        return;
      }
      deps.setMemberSubscriptions(chatId, memberId, types as NotificationType[]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to set member subscriptions' });
    }
  });

  router.post('/settings/telegram/chats/:chatId/link', (req, res) => {
    try {
      const chatId = parseIdParam(req.params.chatId);
      if (chatId === null) {
        res.status(400).json({ error: 'chatId must be a number' });
        return;
      }
      const linked = deps.linkChat(chatId, 0);
      res.json({ success: true, linked });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to link chat' });
    }
  });

  router.post('/settings/telegram/chats/:chatId/unlink', (req, res) => {
    try {
      const chatId = parseIdParam(req.params.chatId);
      if (chatId === null) {
        res.status(400).json({ error: 'chatId must be a number' });
        return;
      }
      const unlinked = deps.unlinkChat(chatId);
      res.json({ success: true, unlinked });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to unlink chat' });
    }
  });

  return router;
}