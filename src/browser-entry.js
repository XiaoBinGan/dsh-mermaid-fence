/**
 * Entry point of the built browser artifact.
 *
 * This is the only file with a side effect: it submits the factory to the
 * host's module-loader facade. Everything else — the observer, the stylesheet,
 * the fence walk — is created later, inside `apply`.
 *
 * mermaid is reached through a dynamic `import()`. esbuild keeps a
 * dynamically-imported module in its own lazily-evaluated chunk *inside* the
 * single output file, so mermaid's module body (and its ~3 MB of diagram
 * definitions) is not evaluated at script-execution time — only when the plugin
 * actually applies. That is what keeps the boot path cheap while still shipping
 * one self-contained file.
 * @module dsh-mermaid-fence/browser-entry
 */

import { register } from './client.js'

/** Load mermaid lazily; resolved by the bundler into an in-file lazy chunk. */
const loadMermaid = () => import('mermaid').then(module => module.default)

const accepted = register({ win: window, loadMermaid })
if (!accepted) {
  // No loader facade: this happens in the test harness and in a plain page.
  // Export the surface so a harness can drive it directly instead of failing.
  window.__dshMermaidFence__ = { register, loadMermaid }
}
