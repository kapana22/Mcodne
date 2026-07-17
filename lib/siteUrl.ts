// Trusted site-URL resolver.
//
// Why: user-facing links in emails (password reset, verification) and post-signout
// redirects must never be composed from attacker-controlled Host / X-Forwarded-Host
// headers — otherwise a forged header exfiltrates tokens or opens redirects.
//
// Precedence:
//   1. `SITE_URL` env var if set (production canonical origin).
//   2. Request host, ONLY if it matches ALLOWED_HOSTS (dev + canonical prod).
//   3. Hard fallback to `https://mcodne.ge`.

const ALLOWED_HOSTS = new Set<string>([
  'mcodne.ge',
  'www.mcodne.ge',
  'localhost:3000',
  '127.0.0.1:3000',
])

function envOrigin(): string | null {
  const raw = process.env.SITE_URL?.trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

export function siteUrl(req?: Request): string {
  const fromEnv = envOrigin()
  if (fromEnv) return fromEnv

  if (req) {
    const host = req.headers.get('host')?.toLowerCase()
    if (host && ALLOWED_HOSTS.has(host)) {
      const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
      return `${proto}://${host}`
    }
  }

  return 'https://mcodne.ge'
}
