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
import type { BotConfigStore } from 'pine-framework/trading/config-store';

export interface BotRouterOptions {
  getEngine: () => BotEngine | null;
  getWalletManager?: () => WalletManager | null;
  getConfigStore?: () => BotConfigStore | null;
  getAutoSelectDeps?: () => {
    AutoMarketSelector: new (options: any) => { select: (candidates: any[], onProgress?: (progress: any) => void) => Promise<any> };
    barFetcher: unknown;
    backtestRunner: unknown;
    broadcast: (msg: unknown) => void;
    candidates: Array<{ symbol: string; timeframe: string }>;
  } | null;
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
  const getConfigStore: () => BotConfigStore | null =
    typeof param === 'function' ? () => null : (param.getConfigStore ?? (() => null));
  const getAutoSelectDeps = typeof param === 'function' ? () => null : param.getAutoSelectDeps ?? (() => null);

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
   * GET /bot/config
   * Get persisted bot configuration.
   */
  router.get('/bot/config', (_req, res) => {
    try {
      const store = getConfigStore();
      if (!store) {
        res.status(404).json({ error: 'Config store not available' });
        return;
      }
      const config = store.load();
      if (!config) {
        res.status(404).json({ error: 'No configuration' });
        return;
      }
      res.json(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  /**
   * PATCH /bot/config/chaos-mode
   * Toggle chaos mode without requiring a full config.
   * Accepts { enabled: boolean } in body.
   */
  router.patch('/bot/config/chaos-mode', (req, res) => {
    try {
      const { enabled } = req.body as { enabled?: boolean };
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ success: false, error: 'Missing or invalid "enabled" (boolean required)' });
        return;
      }

      const store = getConfigStore();
      if (store) {
        const existing = store.load();
        const config: BotConfig = {
          strategySource: existing?.strategySource ?? '',
          dex: existing?.dex ?? 'jupiter-swap',
          ...(existing?.pairs ? { pairs: existing.pairs } : {}),
          risk: existing?.risk ?? { maxDailyLoss: 100 },
          chaosMode: { enabled },
        };
        store.save(config);
      }

      res.json({ success: true, chaosMode: { enabled } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /bot/config
   * Delete persisted bot configuration.
   * Accepts { removeWallet?: boolean } in body.
   * Returns 409 if bot is Running.
   */
  router.delete('/bot/config', async (req, res) => {
    try {
      const engine = getEngine();
      if (!engine) {
        res.status(503).json({ error: 'Trading bot not initialized' });
        return;
      }

      // Block if bot is running
      if (engine.state === 'Running') {
        res.status(409).json({ error: 'Stop the bot before resetting configuration' });
        return;
      }

      const store = getConfigStore();
      if (!store) {
        res.status(503).json({ error: 'Config store not available' });
        return;
      }

      const { removeWallet } = req.body as { removeWallet?: boolean };

      // Delete config
      store.delete();

      // Optionally remove wallet
      if (removeWallet) {
        const wm = getWalletManager();
        if (wm) {
          await wm.removeWallet(async () => true);
        }
      }

      // Reset engine state
      if (engine.state === 'Stopped' || engine.state === 'Error') {
        await engine.reset();
      }

      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
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

      const config: BotConfig = {
        strategySource: strategySource as string,
        dex: dex as BotConfig['dex'],
        ...(Array.isArray(pairs) && pairs.length > 0 ? { pairs } : {}),
        risk: {
          maxDailyLoss: riskObj.maxDailyLoss as number,
        },
        walletPublicKey: typeof walletPublicKey === 'string' ? walletPublicKey : undefined,
        autoSelect: autoSelect === true,
        autoSelectMetric: typeof autoSelectMetric === 'string' ? autoSelectMetric as BotConfig['autoSelectMetric'] : undefined,
      };

      engine.configure(config);

      // Persist config to disk
      const store = getConfigStore();
      if (store) {
        store.save(config);
      }

      res.json({ success: true, config });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

  /**
   * POST /bot/backtest
   * Run auto-select backtests without starting the bot.
   * Returns immediately; progress is broadcast via WebSocket bot:autoSelect channel.
   */
  router.post('/bot/backtest', async (req, res) => {
    try {
      const engine = getEngine();
      if (!engine) {
        res.status(503).json({ success: false, error: 'Trading bot not initialized' });
        return;
      }

      const config = engine.config;
      if (!config) {
        res.status(400).json({ success: false, error: 'Bot not configured. Call /configure first.' });
        return;
      }

      if (!config.autoSelect) {
        res.status(400).json({ success: false, error: 'autoSelect is not enabled in current config' });
        return;
      }

      const deps = getAutoSelectDeps();
      if (!deps) {
        res.status(503).json({ success: false, error: 'Auto-select dependencies not available' });
        return;
      }

      // Filter candidates by selected timeframes if provided
      const selectedTimeframes = req.body?.timeframes as string[] | undefined;
      const candidates = selectedTimeframes && selectedTimeframes.length > 0
        ? deps.candidates.filter(c => selectedTimeframes.includes(c.timeframe))
        : deps.candidates;

      // Run auto-select in background — progress broadcast via WebSocket
      res.json({ success: true, message: 'Backtest started' });

      const selector = new deps.AutoMarketSelector({
        barFetcher: deps.barFetcher,
        backtestRunner: deps.backtestRunner,
        script: config.strategySource,
        dex: config.dex,
        metric: config.autoSelectMetric ?? 'profitFactor',
      });

      const result = await selector.select(candidates, (progress: any) => {
        deps.broadcast({
          channel: 'bot:autoSelect',
          type: 'progress',
          data: progress,
        });
      });

      deps.broadcast({
        channel: 'bot:autoSelect',
        type: 'complete',
        data: {
          best: result.best,
          ranking: result.ranking,
          metric: result.metric,
          evaluatedCount: result.evaluatedCount,
          failedCount: result.failedCount,
        },
      });

      // Store result in engine config for later use by start().
      // Disable autoSelect so engine.start() won't re-run the full backtest.
      const finalConfig = { ...config, autoSelect: false, pairs: [result.best.pair] };
      engine.configure(finalConfig);

      // Persist the final config to disk so the resolved pairs and autoSelect=false
      // survive server restarts. Without this, bot-config.json retains autoSelect:true
      // and engine.start() blocks on an inline re-selection after restart.
      const store = getConfigStore();
      if (store) {
        store.save(finalConfig);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Broadcast error if possible
      const deps = getAutoSelectDeps();
      deps?.broadcast({
        channel: 'bot:autoSelect',
        type: 'error',
        data: { error: message },
      });
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
        undefined,
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
   * GET /bot/wallet/balance
   * Fetch USDC balance for the imported wallet.
   */
  router.get('/bot/wallet/balance', async (_req, res) => {
    try {
      const wm = getWalletManager();
      if (!wm) {
        res.status(503).json({ success: false, error: 'Wallet manager not available' });
        return;
      }

      const hasWallet = await wm.hasWallet();
      if (!hasWallet) {
        res.status(400).json({ success: false, error: 'No wallet imported' });
        return;
      }

      const publicKey = await wm.getPublicKey();
      if (!publicKey) {
        res.status(400).json({ success: false, error: 'No public key available' });
        return;
      }

      // Query USDC balance from Solana mainnet
      // Gracefully handle invalid public key format (e.g., old hex format)
      let PublicKeyClass;
      let owner;
      try {
        ({ PublicKey: PublicKeyClass } = await import('@solana/web3.js'));
        owner = new PublicKeyClass(publicKey);
      } catch {
        // Invalid public key format — return 0 balance
        res.json({ success: true, balance: 0 });
        return;
      }

      const { Connection } = await import('@solana/web3.js');
      const USDC_MINT = new PublicKeyClass('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
        mint: USDC_MINT,
      });

      let balance = 0;
      if (tokenAccounts.value.length > 0) {
        const account = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
        balance = parseFloat(account.uiAmountString) || 0;
      }

      res.json({ success: true, balance });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ success: false, error: `Failed to fetch balance: ${message}` });
    }
  });

  /**
   * POST /bot/wallet/preview
   * Derive public key from seed phrase and fetch USDC balance WITHOUT importing.
   * Lets user verify wallet before committing.
   */
  router.post('/bot/wallet/preview', async (req, res) => {
    try {
      const { seedPhrase } = req.body as Record<string, unknown>;
      if (!seedPhrase || typeof seedPhrase !== 'string') {
        res.status(400).json({ success: false, error: 'Missing or invalid "seedPhrase"' });
        return;
      }

      const words = seedPhrase.trim().split(/\s+/);
      if (words.length !== 12 && words.length !== 24) {
        res.status(400).json({ success: false, error: 'Seed phrase must be 12 or 24 words' });
        return;
      }

      // Derive public key from seed phrase (without importing)
      const { deriveKeypairFromSeed } = await import('pine-framework/trading/wallet');
      const keypair = deriveKeypairFromSeed(seedPhrase.trim());
      const publicKey = keypair.publicKey;

      // Fetch USDC balance
      const { Connection, PublicKey } = await import('@solana/web3.js');
      const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

      const owner = new PublicKey(publicKey);
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
        mint: USDC_MINT,
      });

      let balance = 0;
      if (tokenAccounts.value.length > 0) {
        const account = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
        balance = parseFloat(account.uiAmountString) || 0;
      }

      res.json({ success: true, publicKey, balance });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ success: false, error: `Failed to preview wallet: ${message}` });
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
   * POST /bot/chaos-mode
   * Toggle chaos test mode on/off.
   * Accepts { enabled: boolean } in body.
   * Persists to config store.
   */
  router.post('/bot/chaos-mode', (req, res) => {
    try {
      const engine = getEngine();
      if (!engine) {
        res.status(503).json({ success: false, error: 'Trading bot not initialized' });
        return;
      }

      const { enabled } = req.body as { enabled?: boolean };
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ success: false, error: 'Missing or invalid "enabled" (boolean required)' });
        return;
      }

      if (!engine.config) {
        res.status(400).json({ success: false, error: 'Bot not configured' });
        return;
      }

      // Use hot-swap — works for both Running and non-Running states.
      // The old code called engine.configure() which throws when Running.
      engine.toggleChaosMode(enabled);

      // Persist to disk
      const store = getConfigStore();
      if (store) {
        const currentConfig = engine.config;
        store.save(currentConfig);
      }

      res.json({ success: true, chaosMode: { enabled } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  });

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

      const publicKey = await wm.importWallet(seedPhrase, password);

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
    } catch {
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
    } catch {
      res.status(401).json({ success: false, error: 'Invalid current password' });
    }
  });

  return router;
}
