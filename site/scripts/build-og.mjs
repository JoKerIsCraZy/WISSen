// Throwaway: convert og.svg -> public/og.png at 1200x630.
// Run from site/: node scripts/build-og.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(here, '..', 'og.svg');
const outPath = resolve(here, '..', 'public', 'og.png');

const svg = readFileSync(svgPath);

await sharp(svg, { density: 144 })
  .resize(1200, 630, { fit: 'cover' })
  .png({ compressionLevel: 9, quality: 92 })
  .toFile(outPath);

console.log(`OG image written to ${outPath}`);
