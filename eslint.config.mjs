// ESLint flat config.
//
// ── WHY THIS FILE STOPPED WORKING, SO IT DOESN'T HAPPEN AGAIN ────────────────
// It used to wrap the Next preset in `FlatCompat` — the eslintrc→flat shim:
//
//     const compat = new FlatCompat({ baseDirectory: import.meta.dirname })
//     export default [...compat.extends('next/core-web-vitals'), …]
//
// That is correct for eslint-config-next 15, which shipped a legacy `.eslintrc`
// object. Version 16 ships a NATIVE FLAT CONFIG — a 4-element array whose
// `plugins` are objects, not the `string[]` an eslintrc schema allows. FlatCompat
// dutifully validated it as eslintrc, validation failed, and then eslint's error
// FORMATTER tried to `JSON.stringify` the offending value to build the message.
// That value is the plugin object graph, and eslint-plugin-react self-references,
// so the formatter itself threw:
//
//     TypeError: Converting circular structure to JSON
//       property 'plugins' -> object with constructor 'Object'
//       --- property 'react' closes the circle
//
// The real validation error was never printed, which is why this read as an
// eslint bug rather than a config mismatch. Both `npm run lint` and a direct
// `npx eslint` died before reading a single file — so from 2026-07-25 until
// 2026-08-03 lint checked NOTHING. (It did exit non-zero throughout, so it never
// claimed false success; nothing gates on it, so nobody noticed.)
//
// The preset is flat already: import it, don't shim it. If eslint-config-next is
// ever pinned back to 15.x this must return to FlatCompat — the two are not
// interchangeable, and the failure mode is the stack trace above.

import next from 'eslint-config-next/core-web-vitals'

export default [
  ...next,
  {
    // Build is NOT gated on lint (next.config.js sets eslint.ignoreDuringBuilds)
    // — `tsc --noEmit` inside `npm run check` is the authoritative pre-deploy
    // check. Lint is advisory; it now actually runs.
    ignores: [
      '.next/**',
      'node_modules/**',
      // Standalone scripts rather than app code: the Playwright/.mjs harnesses
      // and the seed files, which have their own conventions.
      'tests/**',
      'prisma/seed*.ts',
    ],
  },
  {
    // ── The React Compiler rules: WARN, not error ────────────────────────────
    // `eslint-plugin-react-hooks` 7 (pulled in by eslint-config-next 16) turned
    // on a new family of rules that check code against React Compiler's
    // assumptions. On this tree they fire 105 times — and because the preset
    // grades them `error`, `npx eslint .` could never exit 0, which is the state
    // a linter dies in: always red, therefore never read.
    //
    // They are graded down, NOT off — every one still prints. The distinction
    // being drawn is what an ERROR means here: something to fix before shipping.
    // These are compiler-readiness advisories on a codebase written before the
    // compiler existed (`set-state-in-effect` alone accounts for 68 of them, and
    // most are the ordinary „sync state from a prop/param on mount" pattern).
    // None of them is a live defect; the classic correctness rules —
    // `rules-of-hooks`, `exhaustive-deps`, and every @next/next rule — keep the
    // severity the preset gave them.
    //
    // To work through them: `npx eslint . --rule '{"react-hooks/set-state-in-effect":"error"}'`,
    // or delete this block once the count is near zero.
    name: 'mcodne/react-compiler-advisory',
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/use-memo': 'warn',
    },
  },
]
