/**
 * Bot API routes — exposes BotEngine lifecycle endpoints.
 *
 * Mounted at /api/bot/* when the trading feature flag is enabled.
 *
 * Endpoints:
 *   POST /api/bot/start           — Start the bot
 *   POST /api/bot/stop            — Stop the bot gracefully
 *   POST /api/bot/emergency-stop  — Emergency stop
 *   POST /api/bot/reset           — Reset from Error to Stopped state
 *   GET  /api/bot/status          — Get current bot status snapshot
 *   POST /api/bot/configure       — Configure the bot
 *   POST /api/bot/wallet/import   — Import wallet from seed phrase
 *   GET  /api/bot/wallet          — Get wallet public key
 *   DELETE /api/bot/wallet        — Remove wallet
 */

import { Router } from 'express';
import type { BotEngine, BotConfig } from 'pine-framework';
import type { WalletManager } from 'pine-framework/trading/wallet';

export interface BotRouterOptions {
  getEngine: () => BotEngine | null;
  getWalletManager?: () => WalletManager | null;
}

export function createBotRouter(opts: BotRouterOptions): Router;
export function createBotRouter(getEngine: () => BotEngine | null): Router;
export function createBotRouter(param: (() => BotEngine | null) | BotRouterOptions): Router {
  const router = Router();

  // Normalize parameter
  const getEngine: () => BotEngine | null =
    typeof param === 'function' ? param : param.getEngine;
  const getWalletManager: () => WalletManager | null =
    typeof param === 'function' ? () => null : (param.getWalletManager ?? (() => null));

  /**
   * POST /bot/start
   * Start the trading bot.
   */
  router.post('/bot/start', async (_req, res) => {
    try {
      const engine = getEngine();
      if (!engine) {
        res.status(503).json({ success: false, error: 'Trading bot not initialized' });
        return;
      }
      await engine.start();
      res.json({ success: true, state: engine.state });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

  /**
   * POST /bot/stop
   * Gracefully stop the bot.
   */
  router.post('/bot/stop', async (_req, res) => {
    try {
      const engine = getEngine();
      if (!engine) {
        res.status(503).json({ success: false, error: 'Trading bot not initialized' });
        return;
      }
      await engine.stop();
      res.json({ success: true, state: engine.state });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

  /**
   * POST /bot/emergency-stop
   * Immediately halt the bot and close positions.
   */
  router.post('/bot/emergency-stop', async (_req, res) => {
    try {
      const engine = getEngine();
      if (!engine) {
        res.status(503).json({ success: false, error: 'Trading bot not initialized' });
        return;
      }
      await engine.emergencyStop();
      res.json({ success: true, state: engine.state });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

  /**
   * POST /bot/reset
   * Reset bot from Error state to Stopped.
   */
  router.post('/bot/reset', async (_req, res) => {
    try {
      const engine = getEngine();
      if (!engine) {
        res.status(503).json({ success: false, error: 'Trading bot not initialized' });
        return;
      }
      await engine.reset();
      res.json({ success: true, state: engine.state });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

  /**
   * GET /bot/status
   * Get current bot status snapshot.
   */
  router.get('/bot/status', (_req, res) => {
    try {
      const engine = getEngine();
      if (!engine) {
        res.json({ success: true, initialized: false });
        return;
      }
      res.json({
        success: true,
        initialized: true,
        state: engine.state,
        config: engine.config,
        startedAt: engine.startedAt,
        uptimeMs: engine.uptimeMs,
        errors: engine.errors,
        lastTransition: engine.lastTransition,
        positions: engine.positions,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /bot/configure
   * Configure the bot with strategy, DEX, pairs, and risk settings.
   */
  router.post('/bot/configure', (req, res) => {
    try {
      const engine = getEngine();
      if (!engine) {
        res.status(503).json({ success: false, error: 'Trading bot not initialized' });
        return;
      }

      const { strategySource, dex, pairs, risk, autoSelect, autoSelectMetric, walletPublicKey } = req.body as Record<string, unknown>;

      // Validate required fields
      if (!strategySource || typeof strategySource !== 'string') {
        res.status(400).json({ success: false, error: 'Missing or invalid "strategySource" (string required)' });
        return;
      }
      if (dex !== 'jupiter-swap' && dex !== 'jupiter-ultra') {
        res.status(400).json({ success: false, error: 'Invalid "dex". Must be "jupiter-swap" or "jupiter-ultra"' });
        return;
      }
      if (autoSelect) {
        // autoSelect determines pairs — nothing to validate here
      } else if (!Array.isArray(pairs) || pairs.length === 0) {
        res.status(400).json({ success: false, error: 'Missing or invalid "pairs" (non-empty array required when autoSelect is false)' });
        return;
      }
      if (!risk || typeof risk !== 'object') {
        res.status(400).json({ success: false, error: 'Missing or invalid "risk" (object required)' });
        return;
      }

      const riskObj = risk as Record<string, unknown>;
      if (typeof riskObj.maxDailyLoss !== 'number' || riskObj.maxDailyLoss < 0) {
        res.status(400).json({ success: false, error: '"risk.maxDailyLoss" must be a non-negative number' });
        return;
      }
      if (typeof riskObj.dailyLossTimezone !== 'string') {
        res.status(400).json({ success: false, error: '"risk.dailyLossTimezone" must be a string' });
        return;
      }

      const config: BotConfig = {
        strategySource: strategySource as string,
        dex: dex as BotConfig['dex'],
        ...(Array.isArray(pairs) && pairs.length > 0 ? { pairs } : {}),
        risk: {
          maxDailyLoss: riskObj.maxDailyLoss as number,
          dailyLossTimezone: riskObj.dailyLossTimezone as string,
          closeOnDailyLoss: riskObj.closeOnDailyLoss === true,
        },
        walletPublicKey: typeof walletPublicKey === 'string' ? walletPublicKey : undefined,
        autoSelect: autoSelect === true,
        autoSelectMetric: typeof autoSelectMetric === 'string' ? autoSelectMetric as BotConfig['autoSelectMetric'] : undefined,
      };

      engine.configure(config);
      res.json({ success: true, config });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

  // ── Wallet endpoints ──

  /**
   * POST /bot/wallet/import
   * Import a wallet from seed phrase.
   */
  router.post('/bot/wallet/import', async (req, res) => {
    try {
      const wm = getWalletManager();
      if (!wm) {
        res.status(503).json({ success: false, error: 'Wallet manager not available' });
        return;
      }

      const { seedPhrase } = req.body as Record<string, unknown>;
      if (!seedPhrase || typeof seedPhrase !== 'string') {
        res.status(400).json({ success: false, error: 'Missing or invalid "seedPhrase" (string required)' });
        return;
      }

      // Check if wallet already exists — require confirmation
      const hasWallet = await wm.hasWallet();
      const confirmReplace = req.body.confirmReplace === true;

      if (hasWallet) {
        if (!confirmReplace) {
          res.status(409).json({
            success: false,
            error: 'A wallet is already imported. Set "confirmReplace: true" to replace it.',
            needsConfirm: true,
          });
          return;
        }
      }

      const publicKey = await wm.importWallet(
        seedPhrase,
        hasWallet ? async () => true : undefined,
      );

      res.json({ success: true, publicKey });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

  /**
   * GET /bot/wallet
   * Get wallet public key.
   */
  router.get('/bot/wallet', async (_req, res) => {
    try {
      const wm = getWalletManager();
      if (!wm) {
        res.json({ success: true, hasWallet: false });
        return;
      }

      const hasWallet = await wm.hasWallet();
      if (!hasWallet) {
        res.json({ success: true, hasWallet: false });
        return;
      }

      const publicKey = await wm.getPublicKey();
      res.json({ success: true, hasWallet: true, publicKey });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /bot/wallet
   * Remove imported wallet.
   */
  router.delete('/bot/wallet', async (req, res) => {
    try {
      const wm = getWalletManager();
      if (!wm) {
        res.status(503).json({ success: false, error: 'Wallet manager not available' });
        return;
      }

      const confirm = req.body.confirm === true || req.query.confirm === 'true';
      if (!confirm) {
        res.status(409).json({
          success: false,
          error: 'Set "confirm: true" to confirm wallet removal.',
          needsConfirm: true,
        });
        return;
      }

      await wm.removeWallet(async () => true);
      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

  // ── Password management endpoints ──

  /**
   * GET /bot/wallet/status
   * Get wallet lock status without exposing seed phrase.
   */
  router.get('/bot/wallet/status', async (_req, res) => {
    try {
      const wm = getWalletManager();
      if (!wm) {
        res.json({ success: true, hasWallet: false, locked: false });
        return;
      }

      const hasWallet = await wm.hasWallet();
      const locked = hasWallet ? wm.isLocked() : false;
      const publicKey = hasWallet ? await wm.getPublicKey() : null;
      res.json({ success: true, hasWallet, locked, publicKey });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /bot/wallet/set-password
   * Import wallet with password encryption.
   * Accepts seedPhrase + password, encrypts and persists wallet.
   */
  router.post('/bot/wallet/set-password', async (req, res) => {
    try {
      const wm = getWalletManager();
      if (!wm) {
        res.status(503).json({ success: false, error: 'Wallet manager not available' });
        return;
      }

      const { seedPhrase, password } = req.body as Record<string, unknown>;
      if (!seedPhrase || typeof seedPhrase !== 'string') {
        res.status(400).json({ success: false, error: 'Missing or invalid "seedPhrase" (string required)' });
        return;
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        return;
      }

      // Only one wallet allowed — reject if one already exists
      const hasWallet = await wm.hasWallet();
      if (hasWallet) {
        res.status(409).json({
          success: false,
          error: 'A wallet already exists. Remove it first before importing a new one.',
        });
        return;
      }

      const publicKey = await wm.importWallet(seedPhrase);

      res.json({ success: true, publicKey });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

  /**
   * POST /bot/wallet/unlock
   * Unlock wallet with password.
   */
  router.post('/bot/wallet/unlock', async (req, res) => {
    try {
      const wm = getWalletManager();
      if (!wm) {
        res.status(503).json({ success: false, error: 'Wallet manager not available' });
        return;
      }

      const { password } = req.body as Record<string, unknown>;
      if (!password || typeof password !== 'string') {
        res.status(400).json({ success: false, error: 'Missing or invalid "password" (string required)' });
        return;
      }

      const publicKey = await wm.unlock(password);
      res.json({ success: true, publicKey });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(401).json({ success: false, error: 'Invalid password' });
    }
  });

  /**
   * POST /bot/wallet/lock
   * Lock wallet — wipe decrypted keypair from memory.
   */
  router.post('/bot/wallet/lock', async (_req, res) => {
    try {
      const wm = getWalletManager();
      if (!wm) {
        res.status(503).json({ success: false, error: 'Wallet manager not available' });
        return;
      }

      wm.lock();
      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

  /**
   * POST /bot/wallet/forgot-password
   * Delete encrypted wallet file, preserve bot data.
   */
  router.post('/bot/wallet/forgot-password', async (_req, res) => {
    try {
      const wm = getWalletManager();
      if (!wm) {
        res.status(503).json({ success: false, error: 'Wallet manager not available' });
        return;
      }

      await wm.forgotPassword();
      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

  /**
   * POST /bot/wallet/change-password
   * Change wallet password.
   */
  router.post('/bot/wallet/change-password', async (req, res) => {
    try {
      const wm = getWalletManager();
      if (!wm) {
        res.status(503).json({ success: false, error: 'Wallet manager not available' });
        return;
      }

      const { currentPassword, newPassword } = req.body as Record<string, unknown>;
      if (!currentPassword || typeof currentPassword !== 'string') {
        res.status(400).json({ success: false, error: 'Missing "currentPassword"' });
        return;
      }
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
        return;
      }

      await wm.changePassword(currentPassword, newPassword);
      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(401).json({ success: false, error: 'Invalid current password' });
    }
  });

  return router;
}
