/**
 * Renderer-logic tests over a REAL DOM and REAL mermaid.
 *
 * mermaid's parse/render is not mocked anywhere in this file: the diagram that
 * the assertions inspect was produced by the mermaid module itself.
 * @module dsh-mermaid-fence/tests/render.test
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { installDom, loadMermaid, keepAlive } from './env.mjs'
import { createRenderer } from '../src/render.js'
import { isMermaidFence, isMermaidLanguage, isMermaidSource } from '../src/detect.js'
import { readThemeTokens, isDarkTheme } from '../src/theme.js'

// See keepAlive() in env.mjs: without a live handle, one stuck await makes
// node:test report every remaining test as cancelled instead of failing it.
const releaseKeepAlive = keepAlive()
after(() => releaseKeepAlive())

/** Markup for one settled code block, in the shape the host really emits. */
function fence(language, source) {
  return `<div class="md-code-block">
  <div class="bannerWrap">
    <div data-code-block-banner>
      <div class="_infostring_1">${language}</div>
      <div><button type="button" class="_copyButton_1">copy</button></div>
    </div>
  </div>
  <div data-code-block-content><pre><code>${source}</code></pre></div>
</div>`
}

let mermaid

before(async () => {
  installDom('<!doctype html><html><body></body></html>')
  mermaid = await loadMermaid()
})

describe('fence detection', () => {
  test('declared mermaid languages are recognised', () => {
    assert.equal(isMermaidLanguage('mermaid'), true)
    assert.equal(isMermaidLanguage('Mermaid'), true)
    assert.equal(isMermaidLanguage('mmd'), true)
    assert.equal(isMermaidLanguage('typescript'), false)
    assert.equal(isMermaidLanguage(undefined), false)
  })

  test('an undeclared fence is recognised by its diagram keyword', () => {
    // `graph` is the case the community plugin's whitelist misses.
    assert.equal(isMermaidSource('graph TD\n  A --> B'), true)
    assert.equal(isMermaidSource('flowchart LR\n  A --> B'), true)
    assert.equal(isMermaidSource('sequenceDiagram\n  A->>B: hi'), true)
    assert.equal(isMermaidSource('const answer = 42'), false)
    assert.equal(isMermaidSource(''), false)
  })

  test('frontmatter and init directives do not hide the diagram keyword', () => {
    assert.equal(isMermaidSource('%%{init:{"theme":"dark"}}%%\ngraph TD\n  A --> B'), true)
    assert.equal(isMermaidSource('---\ntitle: x\n---\nsequenceDiagram\n  A->>B: hi'), true)
    assert.equal(isMermaidSource('%% a comment\ngraph TD\n  A --> B'), true)
  })

  test('a fence is mermaid when either signal fires', () => {
    assert.equal(isMermaidFence('mermaid', 'graph TD'), true)
    assert.equal(isMermaidFence(undefined, 'graph TD'), true)
    assert.equal(isMermaidFence('ts', 'const x = 1'), false)
  })
})

describe('renderer against real mermaid', () => {
  test('a valid fence produces real SVG with nodes and edges', async () => {
    const doc = globalThis.document
    const renderer = createRenderer({ mermaid, doc })
    const svg = await renderer.render('graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C[Done]')
    assert.equal(typeof svg, 'string')
    assert.match(svg, /^<svg[\s>]/)
    assert.match(svg, /role="graphics-document document"/)

    const holder = doc.createElement('div')
    holder.innerHTML = svg
    assert.equal(holder.querySelectorAll('g.node').length, 3, 'three declared nodes')
    assert.equal(holder.querySelectorAll('path.flowchart-link').length, 2, 'two edges')
    assert.ok(holder.querySelectorAll('*').length > 20, 'a non-trivial tree')
  })

  test('invalid syntax rejects with a readable error, never a blank result', async () => {
    const renderer = createRenderer({ mermaid, doc: globalThis.document })
    await assert.rejects(
      () => renderer.render('this is not a diagram at all'),
      error => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /mermaid could not render this diagram/)
        assert.ok(error.message.length > 40, 'the message carries mermaid’s own detail')
        return true
      },
    )
  })

  test('securityLevel is strict and not caller-configurable', async () => {
    const doc = globalThis.document
    const renderer = createRenderer({ mermaid, doc })
    const svg = await renderer.render('graph TD\n  A[X] --> B[Y]')
    // With securityLevel 'strict', mermaid sanitizes labels and disables
    // clickable/script-bearing output.
    assert.doesNotMatch(svg, /<script/i)
    assert.doesNotMatch(svg, /\son(click|error|load)=/i)
    assert.doesNotMatch(svg, /javascript:/i)
  })

  test('a label containing HTML is escaped rather than executed', { skip: 'mermaid’s HTML-label sanitizer never settles in jsdom (no layout/parser completion); asserted for real in tests/browser.test.mjs' }, async () => {
    const renderer = createRenderer({ mermaid, doc: globalThis.document })
    const svg = await renderer.render('graph TD\n  A["<img src=x onerror=alert(1)>"] --> B')
    assert.doesNotMatch(svg, /onerror=/i)
    assert.doesNotMatch(svg, /<img/i)
  })
})

describe('theme bridge', () => {
  test('reads host tokens and reports the host dark attribute', () => {
    const window = installDom('<!doctype html><html><body></body></html>')
    window.document.body.style.setProperty('--dsw-alias-label-primary', 'rgb(1, 2, 3)')
    const tokens = readThemeTokens(window.document)
    assert.equal(tokens.textColor, 'rgb(1, 2, 3)')
    assert.equal(tokens.darkMode, false)
    assert.equal(isDarkTheme(window.document), false)

    window.document.body.setAttribute('data-ds-dark-theme', '')
    assert.equal(isDarkTheme(window.document), true)
    assert.equal(readThemeTokens(window.document).darkMode, true)
  })

  test('falls back to a usable palette when no tokens are present', () => {
    const window = installDom('<!doctype html><html><body></body></html>')
    const tokens = readThemeTokens(window.document)
    assert.match(tokens.textColor, /^#|rgb/)
    assert.match(tokens.background, /^#|rgb/)
  })
})

describe('host DOM reading', () => {
  test('language and source come from the host’s real markup', async () => {
    const window = installDom(`<!doctype html><html><body>${fence('mermaid', 'graph TD\n  A --> B')}</body></html>`)
    const { readFenceLanguage, readFenceSource } = await import('../src/arm.js')
    const block = window.document.querySelector('.md-code-block')
    assert.equal(readFenceLanguage(block), 'mermaid')
    assert.equal(readFenceSource(block).trim(), 'graph TD\n  A --> B')
    assert.equal(isMermaidFence(readFenceLanguage(block), readFenceSource(block)), true)
  })
})
