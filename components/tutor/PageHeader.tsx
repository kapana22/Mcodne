'use client'
// Re-export the shared canonical PageHeader so existing
// `@/components/tutor/PageHeader` imports keep working while the student and
// tutor workspaces share ONE header implementation and title scale.
export { PageHeader } from '@/components/PageHeader'
