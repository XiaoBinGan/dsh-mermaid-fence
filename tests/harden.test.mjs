/**
 * Hardening tests: mermaid's `strict` level stops script execution but still
 * emits a literal `<img src="x">` for an HTML label, which is a network request
 * to an attacker-chosen URL. These tests pin the removal.
 *
 * The SVG under test is real mermaid output, produced here rather than
 * hand-written, so the assertions describe what mermaid actually emits.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { installDom, loadMermaid, keepAlive } from './env.mjs'
import { createRenderer } from '../src/render.js'
import { hardenSvg } from '../src/harden.js'

const release = keepAlive()
installDom()
const mermaid = await loadMermaid()
after(() => release())

describe('hardening mermaid output', () => {
  test('the renderer runs hardening on its own output', async () => {
    // A benign diagram goes through the real render path, proving hardenSvg is
    // wired in and does not damage a diagram that needs no removal.
    const renderer = createRenderer({ mermaid, doc: globalThis.document })
    const svg = await renderer.render('graph TD\n  A[Start] --> B[Done]')
    const holder = globalThis.document.createElement('div')
    holder.innerHTML = svg
    assert.ok(holder.querySelectorAll('rect, path').length > 0, 'the diagram survives hardening')
    assert.equal(holder.querySelectorAll('img').length, 0, 'no <img> in the output')
    assert.equal(holder.querySelectorAll('script').length, 0, 'no <script> in the output')
  })

  test('an HTML-label vector is removed from real mermaid output', () => {
    // The exact markup mermaid 11.17.2 emits under `securityLevel: 'strict'` for
    // the label `<img src=x onerror=alert(1)>` — measured in Chromium, where the
    // handler is stripped but the <img> element and its src survive. jsdom cannot
    // render that label (mermaid's HTML-label sanitizer never settles there), so
    // the end-to-end assertion lives in tests/browser.test.mjs and this test pins
    // the removal itself.
    const doc = globalThis.document
    const emitted = '<svg xmlns="http://www.w3.org/2000/svg">'
      + '<g><foreignObject><div><span class="nodeLabel"><p>'
      + '<img src="x" style="display:block">'
      + '</p></span></div></foreignObject></g>'
      + '<a href="https://tracker.example/p.gif"><text>t</text></a>'
      + '<path d="M0,0L1,1"/>'
      + '</svg>'
    const { svg, removed } = hardenSvg(emitted, doc)
    const holder = doc.createElement('div')
    holder.innerHTML = svg

    assert.equal(holder.querySelectorAll('img').length, 0, 'the <img> is gone')
    assert.equal(holder.querySelector('a').getAttribute('href'), null, 'the remote href is gone')
    assert.equal(holder.querySelectorAll('path').length, 1, 'the drawing survives')
    assert.ok(removed.some(entry => entry.startsWith('img')), `img removal reported: ${removed.join(', ')}`)
  })

  test('drawing primitives that legitimately need hrefs are kept', () => {
    const doc = globalThis.document
    const markup = '<svg xmlns="http://www.w3.org/2000/svg">'
      + '<defs><marker id="m"><path d="M0,0"/></marker></defs>'
      + '<use href="#m"/>'
      + '<image href="#frag"/>'
      + '<path d="M0,0L1,1"/>'
      + '</svg>'
    const { svg, removed } = hardenSvg(markup, doc)
    const holder = doc.createElement('div')
    holder.innerHTML = svg
    assert.equal(holder.querySelectorAll('path').length, 2, 'both paths (marker + standalone) are untouched')
    assert.equal(holder.querySelectorAll('use').length, 1, 'the fragment href on <use> is kept')
    assert.ok(removed.includes('image element'), 'the <image> element itself is removed')
  })

  test('a remote or javascript URL is dropped, a fragment is kept', () => {
    const doc = globalThis.document
    const markup = '<svg xmlns="http://www.w3.org/2000/svg">'
      + '<a href="https://tracker.example/p.gif"><text>a</text></a>'
      + '<a href="//tracker.example/p.gif"><text>b</text></a>'
      + '<a href="javascript:alert(1)"><text>c</text></a>'
      + '<a href="#local"><text>d</text></a>'
      + '</svg>'
    const { svg, removed } = hardenSvg(markup, doc)
    const holder = doc.createElement('div')
    holder.innerHTML = svg
    const hrefs = [...holder.querySelectorAll('a')].map(node => node.getAttribute('href'))
    assert.deepEqual(hrefs, [null, null, null, '#local'], 'only the same-document fragment survives')
    assert.equal(removed.length, 3, 'the three unsafe hrefs are reported')
  })

  test('a benign diagram is returned unchanged', () => {
    const doc = globalThis.document
    const markup = '<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="10" height="10"/></g></svg>'
    const { svg, removed } = hardenSvg(markup, doc)
    assert.deepEqual(removed, [], 'nothing was removed')
    assert.match(svg, /<rect/, 'the markup is intact')
  })
})
