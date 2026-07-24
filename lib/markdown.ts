// Minimal, dependency-free Markdown → HTML for admin-authored blog posts.
// Security: the input is escaped FIRST, so no author-supplied HTML can execute;
// only the small, known subset below is re-introduced as markup. Links are
// restricted to http(s) and site-relative hrefs. Returned HTML is safe to pass
// to dangerouslySetInnerHTML for our own content.
//
// Supported: # ## ### headings, **bold**, *italic*, `code`, [text](url),
// - / * bullet lists, 1. ordered lists, > blockquote, --- rule, paragraphs
// (blank-line separated) with single newlines as <br>.

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

// Inline spans — run on already-escaped text.
function inline(s: string): string {
  // Links [text](href) — allow only http(s):// or a leading "/" (relative).
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, href) => {
    const ok = /^https?:\/\//i.test(href) || href.startsWith('/')
    if (!ok) return text
    const rel = href.startsWith('/') ? '' : ' target="_blank" rel="noopener noreferrer"'
    return `<a href="${href}" style="color:#2F9C86;text-decoration:underline;"${rel}>${text}</a>`
  })
  s = s.replace(/`([^`]+)`/g, '<code style="background:#f1f0ee;padding:1px 5px;border-radius:5px;font-size:0.92em;">$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return s
}

export function renderMarkdown(md: string): string {
  const lines = esc(md ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = [] }
  }
  const flushList = () => {
    if (list) { out.push(`<${list.type}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.type}>`); list = null }
  }
  const flushAll = () => { flushPara(); flushList() }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { flushAll(); continue }

    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushAll()
      const lvl = m[1].length
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`)
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushAll(); out.push('<hr>')
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); flushList()
      out.push(`<blockquote>${inline(m[1])}</blockquote>`)
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara()
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] } }
      list.items.push(m[1])
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      flushPara()
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] } }
      list.items.push(m[1])
    } else {
      flushList()
      para.push(line)
    }
  }
  flushAll()
  return out.join('\n')
}
