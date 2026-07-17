// Origin the Google OAuth redirect_uri is built from. MUST be identical in the
// initiate and callback routes (Google requires an exact registered-URI match),
// so both derive it the same way: SITE_URL env when set (canonical prod /
// proxied host), else the actual request origin (localhost during dev).
export function oauthOrigin(req: Request): string {
  const env = process.env.SITE_URL?.trim().replace(/\/$/, '')
  if (env) return env
  return new URL(req.url).origin
}
