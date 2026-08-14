/**
 * backend/src/backtest-export.ts — backend writer glue for the backtest full
 * data export (OpenSpec backtest-full-data-export).
 *
 * node:fs lives HERE, never in the shared lib module (src/export/backtest-export.ts
 * stays frontend-safe). Writes are atomic: write a temp file, then rename — a
 * crash mid-write never leaves a truncated export or manifest on disk.
 */

import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  exportFilename,
  serializeBacktestExport,
  type BacktestExport,
} from 'pine-framework';

/**
 * Per-invocation export run state threaded through the CLI multi-symbol flow.
 * One ExportRun per CLI invocation (shared across timeframes), so files/symbols
 * accumulate and the final manifest lists every export of the run.
 */
export interface ExportRun {
  runId: string;
  source: 'script' | 'frontend';
  dir: string;
  files: string[];
  symbols: Set<string>;
}

export interface ExportManifest {
  runId: string;
  source: 'script' | 'frontend';
  exportedAt: string;
  files: string[];
  symbols: string[];
}

/**
 * Atomically write one export file into `dir` (mkdir -p first).
 * The filename is derived from the export itself (source, symbol, generatedAt)
 * so callers cannot write a file whose name disagrees with its contents.
 * Returns the filename (for the manifest).
 */
export async function writeExportFile(
  exportObj: BacktestExport,
  dir: string,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const filename = exportFilename(
    exportObj.source,
    exportObj.meta.symbol,
    exportObj.runId,
    new Date(exportObj.generatedAt).getTime(),
  );
  const finalPath = join(dir, filename);
  const tmpPath = join(dir, `.${filename}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmpPath, serializeBacktestExport(exportObj), 'utf-8');
  try {
    await rename(tmpPath, finalPath);
  } catch (err) {
    // Best-effort cleanup: a failed rename must not leave a .tmp orphan behind.
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
  return filename;
}

/**
 * Atomically write manifest.json listing the run's exports.
 * Returns the manifest path.
 */
export async function writeExportManifest(
  runMeta: {
    runId: string;
    source: 'script' | 'frontend';
    files: string[];
    symbols: string[];
  },
  dir: string,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const manifest: ExportManifest = {
    runId: runMeta.runId,
    source: runMeta.source,
    exportedAt: new Date().toISOString(),
    files: [...runMeta.files],
    symbols: [...runMeta.symbols],
  };
  const finalPath = join(dir, 'manifest.json');
  const tmpPath = join(dir, `.manifest.json.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmpPath, JSON.stringify(manifest, null, 2), 'utf-8');
  try {
    await rename(tmpPath, finalPath);
  } catch (err) {
    // Same atomic-write cleanup as writeExportFile: never leak a .tmp orphan.
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
  return finalPath;
}
