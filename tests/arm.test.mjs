/**
 * Arm-level tests over a REAL DOM and REAL mermaid: the four behaviours the
 * package promises. mermaid is not stubbed here either — every SVG asserted
 * below came out of the mermaid module.
 * @module dsh-mermaid-fence/tests/arm.test
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { installDom, loadMermaid, keepAlive } from './env.mjs'
import { createRenderer } from '../src/render.js'
import { createArm } from '../src/arm.js'
import { createPlugin, PLUGIN_ID } from '../src/client.js'
import { labelsFor } from '../src/i18n.js'

const releaseKeepAlive = keepAlive()
after(() => releaseKeepAlive())

let mermaid

before(async () => {
  installDom('<!doctype html><html><body></body></html>')
  mermaid = await loadMermaid()
})

/** One code block in the exact shape the host's markdown renderer emits. */
function block(language, source) {
  return `<div class="md-code-block">
  <div class="banner">
    <div data-code-block-banner><div class="_infostring_x">${language}</div>
      <button type="button" data-host-copy>copy</button></div>
  </div>
  <div data-code-block-content><pre><code>${source}</code></pre></div>
</div>`
}

/** A settled message root holding `inner`. */
function settled(inner) {
  return `<div class="centerContainer"><div class="markdown">${inner}</div></div>`
}

/** A message root that is still streaming. */
function streaming(inner) {
  return `<div class="centerContainer"><div class="markdown" data-streaming="true">${inner}</div></div>`
}

/** Build a window + arm wired to real mermaid. */
function setup(html) {
  const window = installDom(`<!doctype html><html><body>${html}</body></html>`)
  const renderer = createRenderer({ mermaid, doc: window.document })
  const arm = createArm({ renderer, labels: labelsFor(window.document) })
  return { window, doc: window.document, renderer, arm }
}

describe('behaviour 1 — a settled fence becomes a diagram', () => {
  test('the content region is replaced by real SVG and the host copy button survives', async () => {
    const { doc, arm } = setup(settled(block('mermaid', 'graph TD\n  A[Start] --&gt; B[Done]')))
    await arm.scan(doc.body)

    const host = doc.querySelector('[data-dsh-mermaid-diagram]')
    assert.ok(host !== null, 'a diagram wrapper was mounted')
    const svg = host.querySelector('svg')
    assert.ok(svg !== null, 'real SVG is present')
    assert.equal(svg.getAttribute('role'), 'graphics-document document')
    assert.equal(svg.querySelectorAll('g.node').length, 2, 'both nodes came from mermaid')
    assert.equal(svg.querySelectorAll('path.flowchart-link').length, 1, 'the edge came from mermaid')

    // The banner is untouched, so the host's own copy affordance is still there.
    assert.ok(doc.querySelector('[data-code-block-banner]') !== null)
    assert.ok(doc.querySelector('[data-host-copy]') !== null, 'host copy button kept')
  })

  test('behaviour 5 — the source is reachable through a toggle', async () => {
    const { doc, arm } = setup(settled(block('mermaid', 'graph TD\n  A --&gt; B')))
    await arm.scan(doc.body)
    const toggle = doc.querySelector('.dsh-mermaid-toggle')
    const source = doc.querySelector('.dsh-mermaid-source')
    assert.ok(toggle !== null, 'a source toggle exists')
    assert.equal(source.hidden, true, 'source starts hidden')
    assert.equal(source.textContent.trim(), 'graph TD\n  A --> B', 'source is the original fence text')
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')

    toggle.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }))
    assert.equal(source.hidden, false, 'click reveals the source')
    assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  })
})

describe('behaviour 2 — security is strict, not configurable', () => {
  test('renderer exposes no security option and never emits script', async () => {
    const { renderer } = setup('')
    // The only knobs are the mermaid instance, the document and an id prefix.
    assert.deepEqual(Object.keys(renderer).sort(), ['refreshTheme', 'render'])
    const svg = await renderer.render('graph TD\n  A[X] --> B[Y]')
    assert.doesNotMatch(svg, /<script/i)
    assert.doesNotMatch(svg, /\son\w+=/i)
  })
})

describe('behaviour 3 — an invalid fence falls back to the code block', () => {
  test('the original source stays readable and the parse error is shown', async () => {
    const source = 'this is definitely not a diagram'
    const { doc, arm } = setup(settled(block('mermaid', source)))
    await arm.scan(doc.body)

    assert.equal(doc.querySelector('[data-dsh-mermaid-diagram]'), null, 'no diagram was mounted')
    const content = doc.querySelector('[data-code-block-content]')
    assert.ok(content.textContent.includes(source), 'the original fence text is still in the DOM')
    const notice = doc.querySelector('[data-dsh-mermaid-error]')
    assert.ok(notice !== null, 'a failure notice is present')
    assert.equal(notice.getAttribute('role'), 'status')
    assert.match(notice.textContent, /could not render this diagram/, 'the error is readable')
    assert.ok(notice.textContent.length > 60, 'the notice carries mermaid’s own detail')
  })

  test('a failed fence is not retried on the next scan', async () => {
    const { doc, arm } = setup(settled(block('mermaid', 'not a diagram')))
    await arm.scan(doc.body)
    await arm.scan(doc.body)
    assert.equal(doc.querySelectorAll('[data-dsh-mermaid-error]').length, 1, 'exactly one notice')
  })
})

describe('behaviour 1 (negative) — a streaming fence is NOT rendered', () => {
  test('a fence inside a streaming message stays a plain code block', async () => {
    const source = 'graph TD\n  A --&gt; B'
    const { doc, arm } = setup(streaming(block('mermaid', source)))
    await arm.scan(doc.body)

    assert.equal(doc.querySelector('[data-dsh-mermaid-diagram]'), null, 'no diagram while streaming')
    assert.equal(doc.querySelector('svg'), null, 'mermaid was never invoked')
    assert.equal(doc.querySelector('[data-dsh-mermaid-error]'), null, 'and no error either')
    const code = doc.querySelector('[data-code-block-content] code')
    assert.equal(code.textContent.trim(), 'graph TD\n  A --> B', 'the code block is unchanged')
  })

  test('the same fence renders once the streaming attribute is dropped', async () => {
    const source = 'graph TD\n  A --&gt; B'
    const { doc, arm } = setup(streaming(block('mermaid', source)))
    await arm.scan(doc.body)
    assert.equal(doc.querySelector('[data-dsh-mermaid-diagram]'), null)

    // The host drops `data-streaming` when the turn settles.
    doc.querySelector('[data-streaming]').removeAttribute('data-streaming')
    await arm.scan(doc.body)
    assert.ok(doc.querySelector('[data-dsh-mermaid-diagram] svg') !== null, 'now it renders')
  })
})

describe('behaviour 6 — disposal', () => {
  test('the arm stops mounting diagrams after dispose', async () => {
    const { doc, arm } = setup(settled(block('mermaid', 'graph TD\n  A --&gt; B')))
    arm.dispose()
    assert.equal(arm.isDisposed, true)
    await arm.scan(doc.body)
    assert.equal(doc.querySelector('[data-dsh-mermaid-diagram]'), null, 'no diagram after dispose')
  })

  test('apply registers a cleanup for every resource', async () => {
    const window = installDom(`<!doctype html><html><body>${settled(block('mermaid', 'graph TD\n  A --&gt; B'))}</body></html>`)
    const effects = []
    const ctx = { effect: fn => { effects.push(fn) } }

    const plugin = createPlugin({ mermaid, win: window })
    assert.equal(plugin.name, PLUGIN_ID)
    const returned = plugin.apply(ctx)

    assert.ok(window.document.querySelector('[data-dsh-mermaid-fence-styles]') !== null, 'stylesheet injected')
    assert.equal(effects.length, 4, 'observer + timer + arm + stylesheet each registered an effect')

    for (const register of effects) register()()
    returned()

    assert.equal(window.document.querySelector('[data-dsh-mermaid-fence-styles]'), null, 'stylesheet removed')
    assert.equal(window.document.querySelectorAll('[data-dsh-mermaid-diagram]').length, 0, 'no diagram left behind')
  })

  test('the MutationObserver drives rendering, and disposal really disconnects it', async () => {
    // An empty page: nothing exists until the test adds it, so a mounted diagram
    // can only have come from the observer, never from the initial scan.
    const window = installDom('<!doctype html><html><body></body></html>')
    const effects = []
    const plugin = createPlugin({ mermaid, win: window })
    plugin.apply({ effect: fn => { effects.push(fn) } })

    // Let the initial (empty) scan settle before mutating.
    await settle()

    const mount = html => {
      const holder = window.document.createElement('div')
      holder.innerHTML = html
      window.document.body.appendChild(holder)
    }

    mount(settled(block('mermaid', 'graph TD\n  A --&gt; B')))
    await settle(600)
    const beforeDispose = window.document.querySelectorAll('[data-dsh-mermaid-diagram]').length
    assert.equal(beforeDispose, 1, 'the observer scheduled a scan that mounted the diagram')

    // Dispose exactly as the host fiber would.
    for (const register of effects) register()()

    // Mount into a NEW holder, so the assertion cannot be satisfied by the
    // diagram mounted before disposal.
    const holder = window.document.createElement('div')
    holder.innerHTML = settled(block('mermaid', 'graph TD\n  C --&gt; D'))
    window.document.body.appendChild(holder)
    await settle(600)

    assert.equal(
      holder.querySelectorAll('[data-dsh-mermaid-diagram]').length, 0,
      'after disposal the observer is disconnected and the new fence is not rendered',
    )
    assert.equal(
      window.document.querySelectorAll('[data-dsh-mermaid-diagram]').length, beforeDispose,
      'and the total is unchanged',
    )
  })
})

/** Wait long enough for the plugin's debounced scan to run. */
function settle(ms = 400) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
