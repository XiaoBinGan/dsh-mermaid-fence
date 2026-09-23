/**
 * Real-browser verification, run with Playwright's Chromium.
 *
 * This is the only place the plugin is exercised in a browser engine with real
 * SVG layout and a real HTML parser, which is what lets it cover the two things
 * jsdom cannot: that a diagram actually lays out and paints, and that a
 * hostile label is sanitized by mermaid rather than executed.
 *
 * Chromium is resolved from the Playwright cache that already exists on this
 * machine (`~/Library/Caches/ms-playwright`); nothing is downloaded here.
 * @module dsh-mermaid-fence/tests/browser
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let server
let browser
let origin

before(async () => {
  // Serve the package directory so `client.js` is fetched the way the host
  // fetches it: a same-origin classic <script src>.
  server = createServer((request, response) => {
    const name = (request.url ?? '/').split('?')[0].replace(/^\//, '') || 'harness.html'
    try {
      const body = readFileSync(join(root, name))
      response.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
      response.end(body)
    } catch {
      response.writeHead(404)
      response.end('not found')
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch()
})

after(async () => {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
})

describe('real browser', () => {
  test('a settled fence paints a laid-out SVG; a streaming fence stays code', async () => {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(`${origin}/example/harness.html`)

    // The harness drives the arm itself; wait for both passes to finish.
    await page.waitForFunction(() => window.__harnessResult__ !== undefined, null, { timeout: 30_000 })
    const result = await page.evaluate(() => window.__harnessResult__)

    assert.deepEqual(errors, [], 'no uncaught page error')
    assert.equal(result.settledDiagramCount, 1, 'the settled fence became one diagram')
    assert.equal(result.streamingDiagramCount, 0, 'the streaming fence stayed a code block')
    assert.equal(result.failedDiagramCount, 0, 'the invalid fence did not become a diagram')
    assert.ok(result.errorNoticePresent, 'the invalid fence reported its error')

    // REAL LAYOUT: jsdom cannot do this. A rendered flowchart has a non-zero box.
    assert.ok(result.svgWidth > 0, `svg has width ${result.svgWidth}`)
    assert.ok(result.svgHeight > 0, `svg has height ${result.svgHeight}`)
    assert.ok(result.nodeCount >= 2, `${result.nodeCount} node groups laid out`)
    assert.ok(result.edgeCount >= 1, `${result.edgeCount} edges drawn`)
    assert.ok(result.pathLength > 0, `an edge path has real geometry (${result.pathLength})`)

    // Theme binding: the diagram picks up the host tokens actually in effect.
    assert.equal(result.hostTokenRead, true, 'the plugin read the host --dsw-* token')
    assert.match(result.diagramTextColor, /rgb|#/, 'diagram text color resolved')

    // The host's own copy button is still reachable.
    assert.equal(result.hostCopyReachable, true, 'host copy button kept')
    assert.equal(result.sourceToggleWorks, true, 'the source toggle reveals the fence text')
    await page.close()
  })

  test('a hostile label is sanitized, not executed', async () => {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    let alerted = false
    page.on('dialog', async dialog => { alerted = true; await dialog.dismiss() })

    await page.goto(`${origin}/example/harness.html`)
    await page.waitForFunction(() => window.__harnessResult__ !== undefined, null, { timeout: 30_000 })
    const result = await page.evaluate(() => window.__harnessResult__)

    assert.equal(result.hostileHasScript, false, 'no <script> in the output')
    assert.equal(result.hostileHasImg, false, 'no injected <img> in the output')
    assert.equal(result.hostileHasHandler, false, 'no on*= handler attribute in the output')
    assert.equal(alerted, false, 'no dialog was raised')
    assert.deepEqual(errors, [], 'no uncaught page error')
    await page.close()
  })
})
