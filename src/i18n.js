/**
 * UI strings. The spec requires visible text to come from the Client locale
 * service; a standalone community plugin cannot read another plugin's locale
 * service, so the strings live here in one table keyed by language, and the
 * client module picks by `document.documentElement.lang`.
 * @module dsh-mermaid-fence/i18n
 */

/** Strings for every language the plugin ships. */
export const STRINGS = {
  en: {
    showSource: 'Show source',
    hideSource: 'Hide source',
    renderFailed: 'This mermaid diagram could not be rendered; showing the source instead.',
  },
  zh: {
    showSource: '查看源码',
    hideSource: '隐藏源码',
    renderFailed: '该 mermaid 图无法渲染，已保留源码。',
  },
}

/**
 * Resolve the string table for a document.
 * @param doc - the document whose `lang` attribute is read.
 * @returns the matching table, falling back to English.
 */
export function labelsFor(doc) {
  const lang = (doc?.documentElement?.lang ?? '').toLowerCase()
  if (lang.startsWith('zh')) return STRINGS.zh
  return STRINGS.en
}
