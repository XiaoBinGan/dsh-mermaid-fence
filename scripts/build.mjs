/**
 * Build `client.js` — the single browser artifact this package ships.
 *
 * Why one file with mermaid inlined: the host's module table resolves a
 * `dsh.client` row to the package's `./client` export, and mermaid is not a
 * platform module, so it cannot come from `require(...)`. The loader *does*
 * support package-local dynamic chunks through `require.async`, but the chunk
 * URL is composed by the host's bundle roster — a standalone community plugin
 * has no roster row, so a split build would not resolve. Inlining is therefore
 * the only mechanism that installs without host-side integration. The published
 * community plugin `dsh-mermaid` makes the same trade (3.5 MB unpacked).
 *
 * The artifact is committed so `npm install` needs no build step.
 * @module dsh-mermaid-fence/scripts/build
 */

import { build } from 'esbuild'
import { statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [join(root, 'src/browser-entry.js')],
  outfile: join(root, 'client.js'),
  bundle: true,
  // IIFE, not ESM: the host's default `loadBundle` injects a same-origin
  // CLASSIC `<script src>` element, which cannot execute `import`/`export`.
  // The artifact registers itself through `window.__ModuleLoader__`, so it needs
  // no module syntax of its own.
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  banner: {
    js: '/* dsh-mermaid-fence client bundle — mermaid is inlined; see README.md. */',
  },
})

const path = join(root, 'client.js')
const bytes = statSync(path).size
const gzip = gzipSync(readFileSync(path)).length
const kb = n => `${(n / 1024).toFixed(1)} kB`
console.log(`client.js  ${bytes} bytes (${kb(bytes)})  gzip ${gzip} bytes (${kb(gzip)})`)
