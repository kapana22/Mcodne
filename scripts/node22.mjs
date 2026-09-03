// RE-EXEC UNDER NODE 22, SO NOBODY HAS TO REMEMBER TO.
//
// ⚠️ WHY THIS EXISTS, measured 2026-09-03. `node` on this machine resolves to
// v26.5.0 — /opt/homebrew/bin/node comes before /opt/homebrew/opt/node@22/bin
// on PATH — and Next 15.5 fails under 26 in ways that read as code errors, so
// CLAUDE.md tells every session to `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`
// first. Across the last 50 transcripts that prefix rode 2 808 of 9 365 bash
// calls: 29% of every command, carried by hand, and silently absent from the
// other 71% — where the failure is not „wrong node" but a stack trace pointing
// at innocent code.
//
// A prefix that must be typed is a rule that will be forgotten. This makes the
// SCRIPT responsible instead: `npm run dev|build|check` corrects its own
// interpreter and the shell can be anything.
//
// It re-execs at most once (NODE22_REEXEC guards the recursion) and does
// nothing at all when the running node is already 22 or when node@22 is not
// installed — on Railway, where nixpacks pins nodejs_22, this is a no-op.

import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const NODE22 = '/opt/homebrew/opt/node@22/bin/node'
const major = Number(process.versions.node.split('.')[0])

export function ensureNode22() {
  if (major === 22 || process.env.NODE22_REEXEC || !existsSync(NODE22)) return
  const r = spawnSync(NODE22, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE22_REEXEC: '1', PATH: `/opt/homebrew/opt/node@22/bin:${process.env.PATH}` },
  })
  process.exit(r.status ?? 1)
}
