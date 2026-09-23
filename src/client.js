/**
 * The browser artifact's source: the module the dsh web shell loads through
 * `window.__ModuleLoader__.load({ id, factory })`.
 *
 * Discipline taken from the host's `references/ui-plugin.md`:
 * - the factory is side-effect free; it only builds and returns the surface;
 * - styles, listeners and the observer are registered inside `apply` through
 *   `ctx.effect`, each returning its own cleanup;
 * - nothing replaces the app root or appends a second application to `<body>`.
 *
 * React comes from the browser module table. `require('react')` is only touched
 * inside `apply` — never at module scope — so loading the bundle in a bare DOM
 * harness (or in jsdom, for the tests) does not need React at all.
 * @module dsh-mermaid-fence/client
 */

import { createArm } from './arm.js'
import { createRenderer } from './render.js'
import { labelsFor } from './i18n.js'
import { STYLES } from './styles.js'
import { isDarkTheme } from './theme.js'

/** The package name, which the spec requires to equal the loader's factory id. */
export const PLUGIN_ID = 'dsh-mermaid-fence'

/** How long to wait after a DOM change before scanning, in milliseconds. */
const SETTLE_DELAY_MS = 150

/**
 * The arm's surface. Kept as a named export so tests and the harness can drive
 * it without React and without the loader.
 * @param options - surface wiring.
 * @param options.mermaid - the mermaid module (default export).
 * @param options.win - the window whose document is processed.
 * @returns the arm, its renderer, and a scan entry point.
 */
export function createSurface({ mermaid, win }) {
  const doc = win.document
  const renderer = createRenderer({ mermaid, doc, idPrefix: PLUGIN_ID })
  const arm = createArm({ renderer, labels: labelsFor(doc) })
  return { arm, renderer, doc, scan: root => arm.scan(root ?? doc.body) }
}

/**
 * The Cordis surface the loader mounts.
 *
 * `apply` runs once per activation. Every resource it creates is registered with
 * `ctx.effect`, which returns a cleanup function; the returned composite
 * unregisters all of them on dispose.
 * @param options - surface wiring.
 * @param options.mermaid - the mermaid module (default export).
 * @param options.win - the window whose document is processed.
 * @returns the Cordis plugin surface.
 */
export function createPlugin({ mermaid, win }) {
  let teardown = () => {}
  return {
    name: PLUGIN_ID,
    apply(ctx) {
      const doc = win.document
      const { arm, renderer, scan } = createSurface({ mermaid, win })
      let themeWasDark = isDarkTheme(doc)
      let timer
      let pending

      const runScan = () => {
        if (pending !== undefined) return pending
        pending = scan()
          .catch(error => {
            // A scan failure must never surface as an unhandled rejection in the
            // host's console; the per-fence fallback already reports real errors.
            console.warn(`${PLUGIN_ID}: scan failed`, error)
          })
          .finally(() => { pending = undefined })
        return pending
      }

      const schedule = () => {
        win.clearTimeout(timer)
        timer = win.setTimeout(runScan, SETTLE_DELAY_MS)
      }

      const observer = new win.MutationObserver(records => {
        let relevant = false
        for (const record of records) {
          if (record.addedNodes.length > 0 || record.removedNodes.length > 0) {
            relevant = true
            break
          }
        }
        if (!relevant) return
        // A theme switch rewrites the same subtrees; re-read tokens before the
        // next render so the diagram matches the new palette.
        const dark = isDarkTheme(doc)
        if (dark !== themeWasDark) {
          themeWasDark = dark
          renderer.refreshTheme()
        }
        schedule()
      })

      observer.observe(doc.body, { childList: true, subtree: true })
      ctx.effect(() => () => observer.disconnect())
      ctx.effect(() => () => { win.clearTimeout(timer) })
      ctx.effect(() => () => arm.dispose())

      const style = doc.createElement('style')
      style.setAttribute('data-dsh-mermaid-fence-styles', '')
      style.textContent = STYLES
      doc.head.appendChild(style)
      ctx.effect(() => () => style.remove())

      // First pass: a session restored from history is already settled.
      runScan()

      teardown = () => {
        win.clearTimeout(timer)
        observer.disconnect()
        style.remove()
        arm.dispose()
      }
      return teardown
    },
    /** Release the arm; the host calls this when the plugin is unloaded. */
    dispose() {
      teardown()
    },
  }
}

/**
 * Register the plugin into the host's module-loader queue.
 *
 * The factory id must equal the package name, and the factory itself must stay
 * free of side effects, so the surface is built lazily on `apply`.
 * @param options - registration wiring.
 * @param options.win - the window carrying `__ModuleLoader__`.
 * @param options.loadMermaid - loads the mermaid module; injectable so tests can
 *   supply a real mermaid without a bundler.
 * @returns true when the loader accepted the registration.
 */
export function register({ win, loadMermaid }) {
  const sink = win.__ModuleLoader__
  if (sink === undefined || sink === null || typeof sink.load !== 'function') return false
  sink.load({
    id: PLUGIN_ID,
    factory: require => {
      void require
      let plugin
      let loading
      return {
        inject: [],
        apply(ctx) {
          // The mermaid module is fetched lazily so the fence walk starts only
          // after the diagram runtime is present; a failure is reported, not
          // thrown into the host's boot.
          loading = loadMermaid().then(mermaid => {
            plugin = createPlugin({ mermaid, win })
            return plugin.apply(ctx)
          }).catch(error => {
            console.warn(`${PLUGIN_ID}: mermaid failed to load`, error)
          })
          ctx.effect(() => () => {
            if (plugin !== undefined && typeof plugin.dispose === 'function') plugin.dispose()
          })
          void loading
        },
      }
    },
  })
  return true
}
