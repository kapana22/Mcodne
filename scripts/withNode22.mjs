#!/usr/bin/env node
// `node scripts/withNode22.mjs <cmd> [args…]` — run a node-based CLI under
// Node 22 whatever the shell's PATH says. Used by npm run dev|build|start;
// scripts/check.mjs corrects itself directly through ensureNode22().
//
// ⚠️ The one that matters is `next`. Under Node 26 it fails with manifest and
// module errors that point at product code — see CLAUDE.md, „two things that
// cost an afternoon".
//
// Two PATH entries are prepended, and both are needed:
//   node_modules/.bin  — so `next` resolves even when this file is run by hand
//                        rather than by npm, which adds it for its own scripts.
//   node@22's bin      — only when it exists. On Railway it does not: nixpacks
//                        pins nodejs_22 and this whole file is then a pass-through.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, delimiter } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BIN22 = '/opt/homebrew/opt/node@22/bin'
const [, , cmd, ...args] = process.argv
if (!cmd) { console.error('withNode22: nothing to run'); process.exit(2) }

const parts = [join(ROOT, 'node_modules', '.bin')]
if (existsSync(BIN22)) parts.unshift(BIN22)
const PATH = [...parts, process.env.PATH].filter(Boolean).join(delimiter)

const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, PATH } })
child.on('error', e => { console.error(`withNode22: cannot run "${cmd}" — ${e.message}`); process.exit(127) })
child.on('exit', (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exit(code ?? 0) })
