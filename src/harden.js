/**
 * Post-render hardening of mermaid's SVG.
 *
 * `securityLevel: 'strict'` is necessary but not sufficient: it stops script
 * execution and event handlers, but it still lets a diagram emit a literal
 * `<img src="x">` inside a label. That is a network request to an
 * attacker-chosen URL from the reader's browser (a tracking pixel, and an IP
 * disclosure), which a chat rendering untrusted model output should not allow.
 *
 * Measured in Chromium against mermaid 11.17.2: a label of
 * `<img src=x onerror=alert(1)>` survives `strict` as `<img src="x">` with the
 * handler stripped. This module removes the element too.
 *
 * The pass is deliberately conservative — it removes only things that can cause
 * a fetch or execute, and leaves mermaid's real drawing primitives (path, rect,
 * text, g, marker, use with a fragment href, the scoped <style>) untouched.
 * @module dsh-mermaid-fence/harden
 */

/** Elements that can fetch a remote resource or execute, and are never part of a diagram drawing. */
const FORBIDDEN_ELEMENTS = [
  'script', 'iframe', 'object', 'embed', 'img', 'image', 'audio', 'video', 'source', 'track',
]

/** Attributes that can carry a URL. */
const URL_ATTRIBUTES = ['href', 'xlink:href', 'src', 'srcset', 'data', 'poster', 'action', 'formaction']

/**
 * Whether a URL attribute value is safe to keep.
 *
 * Only same-document fragments (`#id`, which `use`/`marker` need) and inline
 * `data:image/*` payloads are kept. Everything else — including `http(s):`,
 * protocol-relative `//host`, and `javascript:` — is dropped.
 * @param value - the attribute value.
 * @returns true when the value cannot cause a remote fetch.
 */
function isSafeUrl(value) {
  const url = value.trim().toLowerCase()
  if (url.startsWith('#')) return true
  if (url.startsWith('data:image/')) return true
  return false
}

/**
 * Remove fetch/execute vectors from rendered SVG markup.
 * @param svg - the SVG markup mermaid produced.
 * @param doc - the document used to parse it.
 * @returns the hardened markup, and the list of what was removed.
 */
export function hardenSvg(svg, doc) {
  const holder = doc.createElement('div')
  holder.innerHTML = svg
  const removed = []

  for (const selector of FORBIDDEN_ELEMENTS) {
    for (const node of holder.querySelectorAll(selector)) {
      removed.push(`${selector} element`)
      node.remove()
    }
  }

  for (const node of holder.querySelectorAll('*')) {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on')) {
        removed.push(`${node.tagName.toLowerCase()}@${name}`)
        node.removeAttribute(attribute.name)
        continue
      }
      if (URL_ATTRIBUTES.includes(name) && !isSafeUrl(attribute.value)) {
        removed.push(`${node.tagName.toLowerCase()}@${name}=${attribute.value.slice(0, 40)}`)
        node.removeAttribute(attribute.name)
      }
    }
  }

  return { svg: holder.innerHTML, removed }
}
