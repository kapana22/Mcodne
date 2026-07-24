// Server-side error capture (Next 15 `onRequestError`). Any error thrown while
// rendering a route or handling an API request lands here → structured stderr
// that Railway captures and makes greppable (`[server-error]`). Account-free;
// forward to a real provider from this one place later. Stable in Next 15 — no
// experimental flag required.
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string },
  context: { routePath?: string; routeType?: string },
): Promise<void> {
  try {
    const e = err as { message?: string; stack?: string; digest?: string }
    // eslint-disable-next-line no-console
    console.error('[server-error]', JSON.stringify({
      t: new Date().toISOString(),
      msg: (e?.message || String(err)).slice(0, 1000),
      stack: (e?.stack || '').slice(0, 4000),
      digest: e?.digest,
      path: (request?.path || context?.routePath || '').slice(0, 500),
      method: request?.method,
      routeType: context?.routeType,
    }))
  } catch {
    // The error hook must never itself throw.
  }
}
