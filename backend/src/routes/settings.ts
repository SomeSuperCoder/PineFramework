import { Router } from 'express';

interface SettingsDeps {
  getBotToken: () => string;
  setBotToken: (token: string) => void;
  getAlertPreference: (chatId: number, alertId: string) => boolean;
  setAlertPreference: (chatId: number, alertId: string, enabled: boolean) => void;
  getSubscribers: () => Array<{ chatId: number }>;
}

export function createSettingsRouter(deps: SettingsDeps): Router {
  const router = Router();

  router.get('/settings/telegram', (_req, res) => {
    const botToken = deps.getBotToken();
    const subscribers = deps.getSubscribers();
    res.json({
      botToken,
      subscribers: subscribers.map((s) => ({
        chatId: s.chatId,
        hasAlertPreferences: true,
      })),
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

  return router;
}
