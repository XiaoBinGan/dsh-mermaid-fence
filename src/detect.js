/**
 * Diagram-source recognition and the render decision, kept free of DOM access so
 * the rules can be tested on plain strings.
 *
 * The host already tells us the fence language: `CodeBlock` puts it in the
 * banner's `infostring` element. We read that rather than the `<code>` class
 * because the host's real code path leaves `code.className` empty (the class
 * contract survives only in the empty-fence branch of `render.tsx`).
 * @module dsh-mermaid-fence/detect
 */

/** Fence languages that mean "this is a mermaid diagram". */
const MERMAID_LANGUAGES = new Set(['mermaid', 'mmd'])

/**
 * The first token of a diagram, used only when no language is declared.
 *
 * Deliberately broader than a `flowchart`-only allowlist: `graph` is mermaid's
 * oldest and still most common flowchart opener, and `%%{init:...}%%` directives
 * and `---` frontmatter legally precede the diagram type. A false positive here
 * is cheap (mermaid rejects it and we fall back to the code block); a false
 * negative silently leaves a diagram unrendered, which is the bug this plugin
 * exists to fix.
 */
const MERMAID_DIAGRAM_KEYWORDS = new Set([
  'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'stateDiagram-v2', 'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart',
  'requirementDiagram', 'gitGraph', 'mindmap', 'timeline', 'sankey-beta',
  'xychart-beta', 'block-beta', 'packet-beta', 'architecture-beta', 'kanban',
  'radar', 'treemap', 'C4Context', 'C4Container', 'C4Component', 'C4Dynamic',
  'C4Deployment', 'zenuml', 'info', 'flowchart-v2',
])

/** Strip a YAML frontmatter block, a `%%{init}%%` directive, and `%%` comments. */
function stripPreamble(source) {
  let text = source.trim()
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3)
    if (end !== -1) text = text.slice(end + 4).trim()
  }
  for (;;) {
    const trimmed = text.trimStart()
    if (trimmed.startsWith('%%{')) {
      const close = trimmed.indexOf('}%%')
      if (close === -1) break
      text = trimmed.slice(close + 3).trimStart()
      continue
    }
    if (trimmed.startsWith('%%')) {
      const lineEnd = trimmed.indexOf('\n')
      if (lineEnd === -1) break
      text = trimmed.slice(lineEnd + 1).trimStart()
      continue
    }
    break
  }
  return text
}

/**
 * Whether a fence's declared language means mermaid.
 * @param language - the fence info string, or undefined when undeclared.
 * @returns true when the language names mermaid.
 */
export function isMermaidLanguage(language) {
  if (typeof language !== 'string') return false
  return MERMAID_LANGUAGES.has(language.trim().toLowerCase())
}

/**
 * Whether a fence's text opens with a mermaid diagram keyword, for fences that
 * declare no language.
 * @param source - the fence's text content.
 * @returns true when the first meaningful token names a diagram type.
 */
export function isMermaidSource(source) {
  if (typeof source !== 'string' || source.trim() === '') return false
  const first = stripPreamble(source).split(/\s+/, 1)[0]
  if (first === undefined) return false
  return MERMAID_DIAGRAM_KEYWORDS.has(first)
}

/**
 * Whether a code block should be rendered as a diagram.
 * @param language - the fence info string, or undefined.
 * @param source - the fence's text content.
 * @returns true when the block is a mermaid diagram.
 */
export function isMermaidFence(language, source) {
  return isMermaidLanguage(language) || isMermaidSource(source)
}
