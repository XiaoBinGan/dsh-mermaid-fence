/**
 * The DOM arm: find settled ```mermaid fences in the conversation and replace
 * them with diagrams, leave streaming ones alone, and fall back to the original
 * code block when mermaid rejects the source.
 *
 * Everything here is a DOM post-process. The host's own React renderer is left
 * untouched, which is what lets this ship as a plugin: the fence keeps its
 * banner and its copy button, and only the content region is swapped.
 * @module dsh-mermaid-fence/arm
 */

import { isMermaidFence } from './detect.js'

/** Marks a code block this arm has already claimed. */
const CLAIMED = 'data-dsh-mermaid-fence'
/** Marks the wrapper that replaced a fence's content. */
const DIAGRAM = 'data-dsh-mermaid-diagram'
/** Marks the fallback notice appended after a failed render. */
const FAILURE = 'data-dsh-mermaid-error'

/** Classes the host's code block and its parts carry, as observed in the host's DOM. */
const SELECTORS = {
  block: '.md-code-block',
  banner: '[data-code-block-banner]',
  content: '[data-code-block-content]',
  infostring: '[class*="infostring"]',
  copyButton: 'button',
}

/**
 * The element that tells us whether a message is still streaming.
 *
 * `AssistantMarkdown` renders `data-streaming` on the message root while tokens
 * are arriving and drops the attribute once the turn settles, so a fence inside
 * a `[data-streaming]` subtree is not final and must not be parsed: parsing a
 * half-written diagram flickers, and mermaid reports errors for text the model
 * is still in the middle of writing.
 * @param element - the fence's code block.
 * @returns the enclosing streaming root, or null when the block is settled.
 */
export function findStreamingAncestor(element) {
  return element.closest('[data-streaming]')
}

/**
 * The fence's declared language, read from the banner's infostring text.
 *
 * The host's real code path leaves `code.className` empty and puts the language
 * only in the banner text, so this is the reliable source.
 * @param block - the fence's code block.
 * @returns the language, or undefined when none was declared.
 */
export function readFenceLanguage(block) {
  const banner = block.querySelector(SELECTORS.banner)
  if (banner === null) return undefined
  const info = banner.querySelector(SELECTORS.infostring)
  const text = (info ?? banner).textContent?.trim() ?? ''
  if (text === '') return undefined
  // The infostring may carry extra attributes after the language, e.g. `ts title=`.
  return text.split(/\s+/, 1)[0]
}

/**
 * The fence's text content, taken from the content region so the banner's
 * language and copy label never leak into the diagram source.
 * @param block - the fence's code block.
 * @returns the fence text.
 */
export function readFenceSource(block) {
  const content = block.querySelector(SELECTORS.content)
  if (content === null) return ''
  const code = content.querySelector('code')
  return (code ?? content).textContent ?? ''
}

/**
 * Replace a code block's content region with a rendered diagram and add the
 * source toggle. The banner is left in place, so the host's copy button stays
 * reachable.
 * @param block - the fence's code block.
 * @param svg - the rendered SVG markup.
 * @param labels - localized UI strings.
 * @returns the diagram wrapper element.
 */
function mountDiagram(block, svg, labels) {
  const doc = block.ownerDocument
  const content = block.querySelector(SELECTORS.content)
  const host = doc.createElement('div')
  host.setAttribute(DIAGRAM, '')
  host.className = 'dsh-mermaid-diagram'

  const figure = doc.createElement('div')
  figure.className = 'dsh-mermaid-figure'
  figure.innerHTML = svg
  host.appendChild(figure)

  const source = doc.createElement('pre')
  source.className = 'dsh-mermaid-source'
  source.hidden = true
  const code = doc.createElement('code')
  code.textContent = readFenceSource(block)
  source.appendChild(code)
  host.appendChild(source)

  const toggle = doc.createElement('button')
  toggle.type = 'button'
  toggle.className = 'dsh-mermaid-toggle'
  toggle.textContent = labels.showSource
  toggle.setAttribute('aria-expanded', 'false')
  toggle.addEventListener('click', () => {
    const showing = source.hidden
    source.hidden = !showing
    toggle.textContent = showing ? labels.hideSource : labels.showSource
    toggle.setAttribute('aria-expanded', String(showing))
  })
  host.insertBefore(toggle, source)

  if (content === null) block.appendChild(host)
  else content.replaceChildren(host)
  block.setAttribute(CLAIMED, '')
  return host
}

/**
 * Keep the original code block and append a readable notice, so a rejected
 * diagram is never a blank box and never a lost fence.
 * @param block - the fence's code block.
 * @param message - the parse failure, already readable.
 * @param labels - localized UI strings.
 */
function mountFailure(block, message, labels) {
  const doc = block.ownerDocument
  block.querySelector(`[${FAILURE}]`)?.remove()
  const notice = doc.createElement('div')
  notice.setAttribute(FAILURE, '')
  notice.className = 'dsh-mermaid-error'
  notice.setAttribute('role', 'status')
  const title = doc.createElement('span')
  title.className = 'dsh-mermaid-error-title'
  title.textContent = labels.renderFailed
  const detail = doc.createElement('span')
  detail.className = 'dsh-mermaid-error-detail'
  detail.textContent = message
  notice.append(title, detail)
  block.appendChild(notice)
  // Claimed so a re-scan does not retry a source mermaid has already rejected.
  block.setAttribute(CLAIMED, '')
}

/**
 * Build the arm's `scan` function.
 * @param options - arm wiring.
 * @param options.renderer - the renderer from `createRenderer`.
 * @param options.labels - localized UI strings.
 * @returns an object with `scan` and `dispose`.
 */
export function createArm({ renderer, labels }) {
  /** Diagram wrappers awaiting a theme refresh. */
  const mounted = new Set()
  /** Fences whose render is in flight, so a re-scan does not double-render. */
  const inFlight = new Set()
  let disposed = false

  /**
   * Render every settled, unclaimed mermaid fence inside `root`.
   * @param root - the subtree to scan.
   * @returns a promise resolving once this pass's renders settle.
   */
  async function scan(root) {
    if (disposed || root === undefined || root === null) return
    const blocks = root.querySelectorAll(`${SELECTORS.block}[${CLAIMED}]`)
    const claimed = new Set(blocks)
    const candidates = []
    for (const block of root.querySelectorAll(SELECTORS.block)) {
      if (claimed.has(block)) continue
      if (findStreamingAncestor(block) !== null) continue
      const language = readFenceLanguage(block)
      const source = readFenceSource(block)
      if (!isMermaidFence(language, source)) continue
      candidates.push({ block, source })
    }
    await Promise.all(candidates.map(async ({ block, source }) => {
      if (inFlight.has(block)) return
      inFlight.add(block)
      try {
        const svg = await renderer.render(source)
        if (disposed) return
        mounted.add(mountDiagram(block, svg, labels))
      } catch (error) {
        if (disposed) return
        mountFailure(block, error instanceof Error ? error.message : String(error), labels)
      } finally {
        inFlight.delete(block)
      }
    }))
  }

  return {
    scan,
    /**
     * Re-render every mounted diagram against the current theme tokens.
     * @param root - the subtree holding mounted diagrams.
     */
    async refresh(root) {
      if (disposed) return
      const wrappers = [...mounted]
      mounted.clear()
      for (const wrapper of wrappers) {
        const block = wrapper.closest(SELECTORS.block)
        if (block === null || root === undefined || root === null || !root.contains(block)) continue
        block.removeAttribute(CLAIMED)
        wrapper.remove()
      }
      await scan(root)
    },
    /** Release everything: drop references so no diagram is refreshed after unmount. */
    dispose() {
      disposed = true
      mounted.clear()
      inFlight.clear()
    },
    /** Whether disposal has run; used by the tests to prove the contract holds. */
    get isDisposed() {
      return disposed
    },
  }
}
