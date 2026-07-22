import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DiskOHLCVCache } from '../cache/DiskOHLCVCache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', '..', 'data');

interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  detail?: string;
}

/** Check that the data directory is writable and has sufficient space. */
function checkDiskSpace(): HealthCheckResult {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    // Try writing a temp file to ensure write access
    const testFile = path.join(dataDir, '.health-check.tmp');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return { status: 'ok' };
  } catch (err) {
    return {
      status: 'error',
      detail: err instanceof Error ? err.message : 'Disk check failed',
    };
  }
}

/** Check that the Bybit API is reachable by fetching a simple endpoint. */
async function checkBybitApi(): Promise<HealthCheckResult> {
  try {
    const baseUrl = process.env.BYBIT_REST_URL || 'https://api.bybit.com';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${baseUrl}/v5/market/time`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (resp.ok) {
      return { status: 'ok' };
    }
    return { status: 'degraded', detail: `Bybit API returned ${resp.status}` };
  } catch (err) {
    return {
      status: 'degraded',
      detail: err instanceof Error ? err.message : 'Bybit API unreachable',
    };
  }
}

export function createStatusRouter(diskCache?: DiskOHLCVCache): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    const [diskCheck, bybitCheck] = await Promise.all([
      checkDiskSpace(),
      checkBybitApi().catch(() => ({ status: 'error' as const, detail: 'Bybit check failed' })),
    ]);

    const checks: Record<string, HealthCheckResult> = {
      disk: diskCheck,
      bybit: bybitCheck,
    };

    // Add disk cache stats if available
    if (diskCache) {
      const stats = diskCache.getStats();
      checks.diskCache = {
        status: entriesToHealth(stats.diskUsageBytes, stats.maxDiskUsageBytes),
        detail: `${stats.entries} entries, ${Math.round(stats.diskUsageBytes / 1024)}KB / ${Math.round(stats.maxDiskUsageBytes / (1024 * 1024))}MB used, hit rate ${stats.hitRate}%`,
      };
    }

    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    const anyError = Object.values(checks).some((c) => c.status === 'error');
    const overallStatus = allOk ? 'ok' : anyError ? 'error' : 'degraded';

    res.json({
      status: overallStatus,
      version: '0.1.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks,
    });
  });

  return router;
}

/** Determine cache health based on usage. */
function entriesToHealth(usedBytes: number, maxBytes: number): 'ok' | 'degraded' | 'error' {
  if (maxBytes === 0) return 'error';
  const ratio = usedBytes / maxBytes;
  if (ratio >= 0.95) return 'degraded'; // nearly full
  if (ratio >= 1.0) return 'error';      // over limit
  return 'ok';
}
