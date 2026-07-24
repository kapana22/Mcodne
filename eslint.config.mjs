import { FlatCompat } from '@eslint/eslintrc'

// Flat config so `next lint` / `npm run lint` runs non-interactively (previously
// there was NO eslint config, so it dropped into a setup prompt and never ran).
// Build is NOT gated on this (next.config eslint.ignoreDuringBuilds) — tsc is the
// authoritative pre-deploy check; lint is advisory.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

export default [
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: ['.next/**', 'node_modules/**', 'tests/**', 'prisma/seed*.ts'],
  },
]
