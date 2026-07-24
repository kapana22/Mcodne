'use client'

// Fallback for uncaught errors that reach the root layout (rare — only fires
// if the root layout / html tree itself throws). Deliberately inline-styled
// (no Tailwind), since a failure this deep may have taken down the CSS bundle.

import { useEffect } from 'react'
import { reportClientError } from '@/lib/reportError'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportClientError('render', error?.message ?? 'global-error', error?.stack, error?.digest)
  }, [error])
  return (
    <html lang="ka">
      <body style={{
        fontFamily: 'system-ui, sans-serif',
        background: '#F8F6F2',
        color: '#2E2A21',
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <div style={{ fontSize: 72, fontWeight: 700, color: '#9B2932', lineHeight: 1 }}>500</div>
          <h1 style={{ marginTop: 16, fontSize: 22, fontWeight: 700 }}>დროებითი ხარვეზი</h1>
          <p style={{ marginTop: 12, color: '#4A4437', fontSize: 14, lineHeight: 1.5 }}>
            გვერდი ვერ ჩაიტვირთა. სცადე თავიდან, ან დაუბრუნდი მთავარს.
          </p>
          {error?.digest && (
            <p style={{ marginTop: 12, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#9C9488' }}>
              ID: {error.digest}
            </p>
          )}
          <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{
                background: '#2F9C86',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 16px',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              თავიდან ცდა
            </button>
            <a
              href="/"
              style={{
                background: '#fff',
                color: '#2E2A21',
                border: '1px solid #DFD8CB',
                borderRadius: 10,
                padding: '10px 16px',
                fontWeight: 600,
                fontSize: 13,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              მთავარი
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
