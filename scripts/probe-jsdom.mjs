/**
 * Probe: does REAL mermaid render to real SVG inside jsdom?
 * Evidence script for the harness claim in README.md.
 * Run: node scripts/probe-jsdom.mjs
 */
import { installDom } from '../tests/env.mjs'

const { window, document } = await installDom(
  '<!doctype html><html><body><div id="host"></div></body></html>',
)

const mermaid = (await import('mermaid')).default
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base' })

const { svg } = await mermaid.render('probe', 'graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C[Done]\n  B -->|no| A')
console.log('OPENING TAG:', svg.slice(0, svg.indexOf('>') + 1))
const holder = document.getElementById('host')
holder.innerHTML = svg
console.log('ELEMENT COUNT:', holder.querySelectorAll('*').length)
console.log('NODES:', holder.querySelectorAll('g.node').length, 'EDGES:', holder.querySelectorAll('path.flowchart-link').length)
window.close()
