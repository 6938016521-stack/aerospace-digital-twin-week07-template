/** Compact deterministic lookup key for structured inputs; not a security hash.
 * Provenance registration still rejects conflicting records for the same key.
 */
export function contentId(namespace: string, inputs: unknown): string {
  const text = JSON.stringify(inputs)
  const words = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
  const primes = [0x01000193, 0x85ebca77, 0xc2b2ae3d, 0x27d4eb2f]
  for (let i = 0; i < text.length; i++) {
    for (let j = 0; j < words.length; j++) words[j] = Math.imul(words[j]! ^ text.charCodeAt(i), primes[j]!) >>> 0
  }
  return `${namespace}:${words.map((word) => word.toString(16).padStart(8, '0')).join('')}`
}
