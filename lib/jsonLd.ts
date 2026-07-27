// Safe JSON-LD serialization for injection into a <script type="application/ld+json"> tag.
//
// JSON.stringify escapes quotes/backslashes but NOT `<`, `>`, or `&`. Without escaping
// those, an attacker-controlled field (e.g. an expert's self-edited fullName/bio) can
// contain `</script>` and break out of the script block, yielding stored XSS. Escaping
// them as their \uXXXX form keeps the JSON valid while making a breakout impossible.
// (U+2028/U+2029 need no escaping here: the block is parsed as JSON, where they are legal.)
export function jsonLdString(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}
