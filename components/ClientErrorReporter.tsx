'use client'
import { useEffect } from 'react'
import { reportClientError } from '@/lib/reportError'

// Captures uncaught client errors that React error boundaries never see —
// errors thrown in event handlers / async callbacks, and unhandled promise
// rejections — and ships them to /api/log-error. Mounted once in AppShell;
// renders nothing. (Render-time throws are still caught by the error.tsx
// boundaries, which report separately.)
export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      reportClientError('window', e.message || String(e.error ?? 'error'), (e.error as Error | undefined)?.stack)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | undefined
      reportClientError('unhandledrejection', r?.message || String(r ?? 'rejection'), r?.stack)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
