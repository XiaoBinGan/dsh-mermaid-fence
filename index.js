/**
 * Host half of the `dsh-mermaid-fence` bundle.
 *
 * The Client module owns everything visible: it walks the conversation DOM for
 * settled ```mermaid fences and replaces them with diagrams. The Host face has
 * no service to provide, no timer, and no listener, so `apply` is deliberately
 * empty — exactly the shape the decoration template ships.
 * @module dsh-mermaid-fence
 */

/** Apply the Host half. Nothing to do: rendering belongs to the Client module. */
export function apply() {}
