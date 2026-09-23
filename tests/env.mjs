/**
 * jsdom environment for the tests, plus the SVG layout stubs mermaid needs.
 *
 * HONEST LIMIT: jsdom implements no SVG layout. `getBBox`, `getScreenCTM` and
 * `getComputedTextLength` do not exist, and mermaid's dagre pass calls them, so
 * without stubs rendering throws. The stubs return fixed numbers, which means
 * jsdom output proves the render pipeline ran and produced the expected
 * structure — it does NOT prove visual geometry or that the diagram looks right.
 * Visual verification is done in a real browser (see README.md).
 * @module dsh-mermaid-fence/tests/env
 */

import { JSDOM } from 'jsdom'

/** Browser globals mermaid and the arm reach for, mirrored onto `globalThis`. */
function mirrorGlobals(window) {
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key.startsWith('_') || key === 'undefined') continue
    if (globalThis[key] !== undefined) continue
    try {
      Object.defineProperty(globalThis, key, {
        value: window[key], writable: true, configurable: true, enumerable: false,
      })
    } catch {
      // Getter-only host globals (navigator on modern Node) cannot be replaced.
    }
  }
  // `navigator` is getter-only on Node 21+, and mermaid reads it for platform
  // detection, so define it directly rather than through the loop above.
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: window.navigator, writable: true, configurable: true, enumerable: false,
    })
  } catch { /* leave the host navigator in place */ }
}

/** Install the SVG layout stubs that stand in for the missing jsdom layout. */
function installSvgStubs(window) {
  const proto = window.SVGElement.prototype
  proto.getBBox = function getBBox() {
    return { x: 0, y: 0, width: 100, height: 20 }
  }
  proto.getScreenCTM = function getScreenCTM() {
    const matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    matrix.inverse = () => matrix
    matrix.multiply = () => matrix
    return matrix
  }
  proto.getComputedTextLength = function getComputedTextLength() {
    return 100
  }
  if (window.SVGTextElement !== undefined) {
    window.SVGTextElement.prototype.getComputedTextLength = proto.getComputedTextLength
  }
}

/**
 * Build a jsdom window and mirror it onto the Node globals mermaid expects.
 * @param html - the document markup.
 * @returns the jsdom window, with SVG stubs installed.
 */
export function installDom(html) {
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://localhost/' })
  const { window } = dom
  mirrorGlobals(window)
  installSvgStubs(window)
  return window
}

/**
 * Load the real mermaid module against the installed DOM.
 *
 * The module is imported only after the globals exist, because mermaid reads
 * them during module evaluation.
 * @returns the mermaid default export.
 */
export async function loadMermaid() {
  const module = await import('mermaid')
  return module.default
}

/**
 * Hold the Node event loop open for the duration of a test file.
 *
 * Without this, an await that never settles inside jsdom (mermaid occasionally
 * waits on a browser facility jsdom does not implement) lets the loop drain, and
 * `node --test` then reports every remaining test as `cancelledByParent` with a
 * zero duration — which hides the real culprit instead of failing it. With a
 * live handle the stuck test instead trips its own timeout.
 * @returns a disposer that releases the handle.
 */
export function keepAlive() {
  const handle = setInterval(() => {}, 1_000)
  return () => clearInterval(handle)
}
