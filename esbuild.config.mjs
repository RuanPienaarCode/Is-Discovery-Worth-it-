/* The build, as one reproducible Node script (same layout as rhythm-vault,
   gym-vault and budget-vault). BOTH root main.js and root styles.css are
   BUILD OUTPUT:
     main.js    <- bundled from src/*.js
     styles.css <- src/styles.css, then every src/css/*.css in name order
                   (one file per feature, so parallel work never shares a file)
   An edit made directly to a root artifact is lost on the next build. */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const rel = p => join(root, p);

const cssParts = ['src/styles.css', ...readdirSync(rel('src/css')).filter(f => f.endsWith('.css')).sort().map(f => 'src/css/' + f)];
writeFileSync(rel('styles.css'), cssParts.map(p => readFileSync(rel(p), 'utf8')).join('\n'));

/* target safari15 = the engine floor this plugin must parse on (Obsidian
   mobile runs the OS WebView; minAppVersion is not the floor). format cjs +
   external obsidian/@codemirror: Obsidian loads main.js as CommonJS and
   provides those modules itself — bundling a second copy of CodeMirror
   breaks every editor extension. */
await esbuild.build({
  entryPoints: [rel('src/main.js')],
  outfile: rel('main.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'safari15',
  external: ['obsidian', '@codemirror/view', '@codemirror/state'],
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
});
