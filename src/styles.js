/**
 * Stylesheet for the diagram arm. Deliberately small and token-driven: every
 * color comes from the host's `--dsw-*` custom properties, so the plugin has no
 * palette of its own and stays legible under either host theme.
 * @module dsh-mermaid-fence/styles
 */

/** The arm's CSS, injected once by the client module. */
export const STYLES = `
.dsh-mermaid-diagram {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
}
.dsh-mermaid-figure {
  display: flex;
  justify-content: center;
  overflow-x: auto;
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-mermaid-figure svg {
  max-width: 100%;
  height: auto;
}
.dsh-mermaid-toggle {
  align-self: flex-start;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary, inherit);
  background: var(--dsw-alias-bg-layer-2, transparent);
  border: 1px solid var(--dsw-alias-border-l2, currentColor);
  border-radius: 4px;
}
.dsh-mermaid-toggle:hover {
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2, transparent));
}
.dsh-mermaid-source {
  margin: 0;
  padding: 8px;
  overflow-x: auto;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-bg-layer-2, transparent);
  border: 1px solid var(--dsw-alias-border-l2, currentColor);
  border-radius: 4px;
}
.dsh-mermaid-error {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-bg-layer-2, transparent);
  border: 1px solid var(--dsw-alias-interactive-bg-hover-danger, var(--dsw-alias-border-l2, currentColor));
  border-radius: 4px;
}
.dsh-mermaid-error-title {
  font-weight: 600;
  color: var(--dsw-alias-label-caption, inherit);
}
.dsh-mermaid-error-detail {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
`
