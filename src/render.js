/**
 * The renderer: wraps a mermaid instance so a diagram either produces SVG or
 * throws a readable error, and so the security posture is not configurable by
 * callers. Model output is untrusted input; `securityLevel: 'strict'` is
 * hardcoded here on purpose and is not exposed as an option.
 * @module dsh-mermaid-fence/render
 */

import { readThemeTokens } from './theme.js'
import { hardenSvg } from './harden.js'

/** Counter feeding mermaid's element ids; mermaid requires a unique id per render. */
let sequence = 0

/**
 * Create a renderer bound to one mermaid instance and one document.
 * @param options - renderer wiring.
 * @param options.mermaid - the mermaid module (default export).
 * @param options.doc - the document whose theme tokens are read.
 * @param options.idPrefix - prefix for generated mermaid element ids.
 * @returns an object with `render` and `refreshTheme`.
 */
export function createRenderer({ mermaid, doc, idPrefix = 'dsh-mermaid-fence' }) {
  let initialized = false

  function initialize() {
    mermaid.initialize({
      startOnLoad: false,
      // Hardcoded: fence text is model output, i.e. untrusted. Never configurable.
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: readThemeTokens(doc),
      // The host draws its own copy affordance; mermaid's is suppressed so the
      // diagram never competes with the code block's own controls.
      flowchart: { htmlLabels: false, useMaxWidth: true },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
    })
    initialized = true
  }

  return {
    /**
     * Render one diagram.
     * @param source - the fence's text content.
     * @returns the rendered SVG markup.
     * @throws Error naming mermaid's own parse message when the source is invalid.
     */
    async render(source) {
      if (!initialized) initialize()
      sequence += 1
      const id = `${idPrefix}-${sequence}`
      try {
        const { svg } = await mermaid.render(id, source)
        if (typeof svg !== 'string' || svg.trim() === '') {
          throw new Error('mermaid produced no SVG')
        }
        // `strict` alone still lets a label emit <img src="x">; strip the
        // remaining fetch/execute vectors before the markup reaches the DOM.
        const hardened = hardenSvg(svg, doc)
        if (hardened.svg.trim() === '') {
          throw new Error('mermaid produced no SVG after hardening')
        }
        return hardened.svg
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        throw new Error(`mermaid could not render this diagram: ${message}`, { cause })
      }
    },

    /** Re-read the host theme tokens; the next render picks up a theme switch. */
    refreshTheme() {
      initialize()
    },
  }
}
