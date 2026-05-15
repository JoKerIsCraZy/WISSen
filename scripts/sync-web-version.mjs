#!/usr/bin/env node
/**
 * Sync der Sub-Package-Versionen (web-svelte/package.json + site/package.json)
 * auf die Root-Package-Version (package.json).
 *
 * Wird automatisch via Root-`postversion`-Hook nach jedem `npm version <bump>`
 * im Root-Verzeichnis ausgeführt UND vom Auto-Bump-Workflow nach
 * `release: published`. So bleiben Backend (`wissen`), Frontend
 * (`wissen-web`) und Docs-Site (`wissen-site`) immer auf der
 * gleichen Version — statt dass das Build-Log "wissen-web@1.0.0" zeigt
 * während das Backend bei 1.1.x ist.
 *
 * Idempotent — wenn die Versionen schon identisch sind, kein Write, kein
 * Trailing-Newline-Drift.
 *
 * Usage:
 *   node scripts/sync-web-version.mjs           # liest root version, schreibt alle subs
 *   node scripts/sync-web-version.mjs --check   # nur prüfen, exit 1 bei Mismatch
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ROOT_PKG = join(ROOT, 'package.json');
// Sub-Packages die mit der Root-Version mitwandern. Wenn neue Sub-
// Workspaces dazukommen einfach hier eintragen — Loop unten verarbeitet sie.
const SUB_PKGS = [
  { name: 'web-svelte', path: join(ROOT, 'web-svelte', 'package.json') },
  { name: 'site',       path: join(ROOT, 'site', 'package.json') }
];

const checkOnly = process.argv.includes('--check');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJsonPretty(path, obj) {
  // npm hält JSON-Files mit 2-Space-Indent + trailing newline. Match.
  await writeFile(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

async function main() {
  const root = await readJson(ROOT_PKG);

  if (!root.version) {
    console.error('[sync-web-version] root package.json hat keine "version"');
    process.exit(2);
  }

  let drift = false;
  const updates = [];

  for (const sub of SUB_PKGS) {
    let pkg;
    try {
      pkg = await readJson(sub.path);
    } catch (err) {
      // Fehlende sub-package.json wird übersprungen statt Fehler. Erlaubt
      // dass Repos ohne web-svelte/ oder site/ den Script ohne Anpassung
      // benutzen können (z.B. Forks).
      console.log(`[sync-web-version] skip ${sub.name}: ${err.code || err.message}`);
      continue;
    }

    if (pkg.version === root.version) {
      console.log(`[sync-web-version] ${sub.name}: bereits in sync (${root.version})`);
      continue;
    }

    drift = true;
    if (checkOnly) {
      console.error(
        `[sync-web-version] DRIFT: root=${root.version} ${sub.name}=${pkg.version}`
      );
      continue;
    }

    const oldVersion = pkg.version;
    pkg.version = root.version;
    await writeJsonPretty(sub.path, pkg);
    updates.push(`${sub.name}: ${oldVersion} -> ${root.version}`);
  }

  if (checkOnly && drift) process.exit(1);
  updates.forEach((u) => console.log(`[sync-web-version] ${u}`));
}

main().catch((err) => {
  console.error('[sync-web-version] Fehler:', err);
  process.exit(1);
});
