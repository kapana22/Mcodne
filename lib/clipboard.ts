// Copy the given text to the user's clipboard, returning `true` on success.
//
// Prefers the async Clipboard API (only available in secure contexts), then
// falls back to the `document.execCommand('copy')` trick for older browsers
// or non-HTTPS previews. Any failure resolves to `false` so callers can show
// an error toast rather than throwing.
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // Fallback for older browsers / non-HTTPS
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    return true
  } catch { return false }
}
