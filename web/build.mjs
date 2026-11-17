/* eslint-disable no-console */
// Bundles web/src/main.ts (plus the shared engine and curriculum from ../src)
// into one self-contained HTML page: web/dist/eng.html.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = await build({
  entryPoints: [join(here, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  write: false,
  legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(join(here, 'template.html'), 'utf8') + `\n<script>${js}</script>\n`;
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist/eng.html'), html);
console.log(`web/dist/eng.html  ${(html.length / 1024).toFixed(1)} KB`);
