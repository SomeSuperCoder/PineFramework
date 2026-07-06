import * as fs from 'node:fs';
import * as path from 'node:path';
import { ScriptsManifestStore } from './store/ScriptsManifestStore.js';
import { uniqueFilename } from './utils/filename.js';

export function migrateLegacyScripts(
  dataDir: string,
  scriptsDir: string,
  manifestStore: ScriptsManifestStore
): { migrated: number; skipped: number } {
  const legacyPath = path.join(dataDir, 'scripts.json');

  if (!fs.existsSync(legacyPath)) {
    return { migrated: 0, skipped: 0 };
  }

  const legacyData = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
  const scripts = legacyData.scripts || [];

  if (scripts.length === 0) {
    return { migrated: 0, skipped: 0 };
  }

  const existingManifestIds = new Set(manifestStore.getAll().map((e) => e.id));
  let migrated = 0;
  let skipped = 0;

  for (const script of scripts) {
    if (existingManifestIds.has(script.id)) {
      skipped++;
      continue;
    }

    const filename = uniqueFilename(
      script.name,
      manifestStore.getExistingFilenames()
    ) + '.pine';

    const subdir = script.scriptType === 'strategy' ? 'strategies' : 'indicators';
    const filePath = path.join(scriptsDir, subdir, filename);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, script.source, 'utf-8');

    manifestStore.add({
      id: script.id,
      filename,
      name: script.name,
      scriptType: script.scriptType,
      filePath,
      createdAt: script.createdAt,
      updatedAt: script.updatedAt,
      checksum: '',
    });

    migrated++;
  }

  const migratedPath = path.join(dataDir, 'scripts.json.migrated');
  fs.renameSync(legacyPath, migratedPath);

  return { migrated, skipped };
}
