/* Keyboard-shortcut safety rules (lib/keyboard, components/KeyboardShortcuts).
 *
 * The failure mode these guard against is specific and nasty: a bare-letter
 * shortcut that forgets to check whether the user is TYPING makes that letter
 * impossible to enter anywhere on the site. `/` appears in every URL someone
 * pastes into the website field on /apply, so getting this wrong silently
 * breaks a form nobody would think to blame on a shortcut.
 */
import { readFileSync } from 'node:fs'
import { isTypingTarget, isCmdOrCtrl, wrapIndex } from '../lib/keyboard'

let passed = 0, failed = 0
const check = (name: string, ok: boolean, why = '') => {
  if (ok) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${why ? ` — ${why}` : ''}`) }
}

// Minimal element stubs — no DOM needed for the rules themselves.
const el = (tagName: string, extra: Record<string, unknown> = {}) =>
  ({ tagName, isContentEditable: false, closest: () => null, ...extra }) as unknown as EventTarget

check('K1: a text input counts as typing', isTypingTarget(el('INPUT')))
check('K2: a textarea counts as typing', isTypingTarget(el('TEXTAREA')))
check('K3: a select counts as typing', isTypingTarget(el('SELECT')))
check('K4: contenteditable counts as typing', isTypingTarget(el('DIV', { isContentEditable: true })))
check('K5: an open menu owns its own keys',
  isTypingTarget(el('BUTTON', { closest: (s: string) => (s.includes('menu') ? {} : null) })),
  'arrows inside a role=menu must not also drive the page')
check('K6: an ordinary button does NOT count as typing', !isTypingTarget(el('BUTTON')))
check('K7: null target is safe', !isTypingTarget(null))

check('K8: ⌘ and Ctrl are both accepted',
  isCmdOrCtrl({ metaKey: true, ctrlKey: false } as KeyboardEvent) &&
  isCmdOrCtrl({ metaKey: false, ctrlKey: true } as KeyboardEvent) &&
  !isCmdOrCtrl({ metaKey: false, ctrlKey: false } as KeyboardEvent),
  'macOS and Windows users must get the same chord without platform sniffing')

check('K9: wrapIndex wraps at both ends',
  wrapIndex(-1, 5) === 4 && wrapIndex(5, 5) === 0 && wrapIndex(2, 5) === 2)
check('K10: wrapIndex survives an empty list', wrapIndex(3, 0) === 0)

// ── the source-level rules the runtime can't express ────────────────────────
const src = readFileSync(new URL('../components/KeyboardShortcuts.tsx', import.meta.url), 'utf8')

check('K11: bare-key handling is gated on isTypingTarget',
  /isTypingTarget\(e\.target\)\)\s*return/.test(src),
  'without this gate, `/` becomes untypeable in every field on the site')

check('K12: the typing gate comes BEFORE the `/` branch',
  src.indexOf('isTypingTarget(e.target)') < src.indexOf("e.key === '/'"),
  'order is the whole protection — a gate after the branch protects nothing')

check('K13: unowned modifier chords are left to the browser',
  /if \(e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey\) return/.test(src),
  '⌘L / ⌘F / ⌘1 must keep working')

check('K14: ⌘K is handled ABOVE the typing gate (it is safe mid-sentence)',
  src.indexOf("e.key === 'k'") < src.indexOf('isTypingTarget(e.target)'),
  'a modified chord cannot collide with typing, and that is exactly when you want it')

check('K15: the overlay is escapable',
  /e\.key === 'Escape'/.test(src))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
