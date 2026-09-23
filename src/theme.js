/**
 * Theme bridge: read the host's design tokens and hand mermaid a palette that
 * matches the surrounding chat, so a diagram stays legible in both light and
 * dark mode without the plugin owning a color scheme of its own.
 *
 * The host flips to dark by setting `data-ds-dark-theme` on `<body>` and
 * re-declares every `--dsw-*` custom property under that selector, so reading
 * the resolved values is enough: the plugin never branches on light/dark itself.
 * @module dsh-mermaid-fence/theme
 */

/** Token names the palette reads, with the fallback used when one is absent. */
const TOKENS = {
  background: ['--dsw-alias-bg-layer-1', '#ffffff'],
  surface: ['--dsw-alias-bg-layer-2', '#f5f5f5'],
  text: ['--dsw-alias-label-primary', '#1a1a1a'],
  mutedText: ['--dsw-alias-label-secondary', '#5c5c5c'],
  border: ['--dsw-alias-border-l2', '#d9d9d9'],
  accent: ['--dsw-alias-brand-primary', '#4d6bfe'],
}

/** Read one custom property, falling back when it resolves to nothing. */
function readToken(style, name, fallback) {
  if (style === undefined || style === null) return fallback
  const raw = style.getPropertyValue(name)
  if (typeof raw !== 'string') return fallback
  const value = raw.trim()
  return value === '' ? fallback : value
}

/**
 * Whether the host is currently in its dark theme.
 * @param doc - the document to inspect.
 * @returns true when `<body>` carries the host's dark-theme attribute.
 */
export function isDarkTheme(doc) {
  const body = doc?.body
  return body !== undefined && body !== null && body.hasAttribute('data-ds-dark-theme')
}

/**
 * Build the mermaid `themeVariables` for the host's current theme.
 * @param doc - the document whose tokens are read.
 * @returns mermaid theme variables keyed by mermaid's own names.
 */
export function readThemeTokens(doc) {
  const view = doc?.defaultView
  const style = view === undefined || view === null || doc?.body === undefined || doc.body === null
    ? undefined
    : view.getComputedStyle(doc.body)
  const pick = key => {
    const [name, fallback] = TOKENS[key]
    return readToken(style, name, fallback)
  }
  const background = pick('background')
  const surface = pick('surface')
  const text = pick('text')
  const mutedText = pick('mutedText')
  const border = pick('border')
  const accent = pick('accent')
  return {
    darkMode: isDarkTheme(doc),
    background,
    primaryColor: surface,
    primaryTextColor: text,
    primaryBorderColor: border,
    secondaryColor: surface,
    tertiaryColor: background,
    lineColor: mutedText,
    textColor: text,
    nodeTextColor: text,
    edgeLabelBackground: background,
    clusterBkg: surface,
    clusterBorder: border,
    titleColor: text,
    // Kept for the sequence/state diagrams, which color their own actors.
    actorBkg: surface,
    actorBorder: border,
    actorTextColor: text,
    signalColor: mutedText,
    signalTextColor: text,
    labelBoxBkgColor: surface,
    labelBoxBorderColor: border,
    labelTextColor: text,
    loopTextColor: text,
    noteBkgColor: surface,
    noteBorderColor: border,
    noteTextColor: text,
    fontFamily: 'inherit',
    fontSize: '14px',
    // A single accent for emphasis; every other hue stays on the token palette.
    pie1: accent,
    pie2: surface,
    pie3: background,
  }
}
