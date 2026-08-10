/*
 * The category hierarchy rules — lib/categoryTree.ts.
 *
 * Run: npx tsx --test tests/categoryTree.test.ts
 *
 * These assertions are the redirect contract in test form. The migration
 * (2026-08-10-category-hierarchy) ends with two RAISE EXCEPTION blocks stating
 * the same two things — no REDIRECTED row without a parent, no parent that is
 * itself REDIRECTED — because a chained 301 is how an old URL loses the history
 * this whole change exists to keep. The migration guards the data once, at
 * migration time; this file guards the admin screen, which can re-create the
 * problem any day afterwards.
 *
 * If a future change makes the tree deeper than one level, these fail first and
 * name what else has to move: the redirect resolver and the aggregate count.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { hierarchyError, canBeParent, TREE_ERROR } from '../lib/categoryTree'
import type { TreeNode, TreeTarget } from '../lib/categoryTree'

const node = (id: string, over: Partial<TreeNode> = {}): TreeNode =>
  ({ id, status: 'VISIBLE', parentId: null, ...over })
const target = (id: string, over: Partial<TreeTarget> = {}): TreeTarget =>
  ({ id, status: 'VISIBLE', parentId: null, childCount: 0, ...over })

test('the ordinary moves are allowed', () => {
  // hide a sphere
  assert.equal(hierarchyError(target('a'), { status: 'HIDDEN' }, null), null)
  // give it a parent
  assert.equal(hierarchyError(target('a'), { parentId: 'b' }, node('b')), null)
  // parent + redirect in one PATCH, which is how the admin screen sends it
  assert.equal(hierarchyError(target('a'), { status: 'REDIRECTED', parentId: 'b' }, node('b')), null)
  // clear the parent while going back to visible
  assert.equal(hierarchyError(target('a', { status: 'REDIRECTED', parentId: 'b' }), { status: 'VISIBLE', parentId: null }, null), null)
})

test('a category cannot be its own parent', () => {
  assert.equal(hierarchyError(target('a'), { parentId: 'a' }, node('a')), 'SELF_PARENT')
})

test('the parent has to exist and has to be the one asked for', () => {
  assert.equal(hierarchyError(target('a'), { parentId: 'b' }, null), 'PARENT_NOT_FOUND')
  assert.equal(hierarchyError(target('a'), { parentId: 'b' }, node('c')), 'PARENT_NOT_FOUND')
})

test('no redirect chains — from either side', () => {
  // the parent is itself pointed elsewhere
  assert.equal(
    hierarchyError(target('a'), { parentId: 'b' }, node('b', { status: 'REDIRECTED', parentId: 'c' })),
    'PARENT_IS_REDIRECTED',
  )
  // the parent is somebody's child, so this would be a third level
  assert.equal(
    hierarchyError(target('a'), { parentId: 'b' }, node('b', { parentId: 'c' })),
    'PARENT_HAS_PARENT',
  )
})

test('a row with children can neither gain a parent nor start redirecting', () => {
  const withKids = target('a', { childCount: 2 })
  assert.equal(hierarchyError(withKids, { parentId: 'b' }, node('b')), 'HAS_CHILDREN')
  assert.equal(hierarchyError(withKids, { status: 'REDIRECTED', parentId: 'b' }, node('b')), 'HAS_CHILDREN')
})

test('REDIRECTED without a parent is a dead end and is refused', () => {
  assert.equal(hierarchyError(target('a'), { status: 'REDIRECTED' }, null), 'REDIRECT_NEEDS_PARENT')
  // …including the sideways version: keep the status, drop the parent
  assert.equal(
    hierarchyError(target('a', { status: 'REDIRECTED', parentId: 'b' }), { parentId: null }, null),
    'REDIRECT_NEEDS_PARENT',
  )
})

test('the parent picker offers exactly what the rules would accept', () => {
  const me = { id: 'a' }
  assert.equal(canBeParent(node('a'), me), false)                                   // self
  assert.equal(canBeParent(node('b'), me), true)                                    // a plain sphere
  assert.equal(canBeParent(node('b', { status: 'HIDDEN' }), me), true)              // hidden is still a real sphere
  assert.equal(canBeParent(node('b', { status: 'REDIRECTED', parentId: 'c' }), me), false)
  assert.equal(canBeParent(node('b', { parentId: 'c' }), me), false)                // already a child
})

test('every code has a sentence', () => {
  for (const [code, sentence] of Object.entries(TREE_ERROR)) {
    assert.ok(sentence.length > 0, `${code} has no message`)
    assert.match(sentence, /[Ⴀ-ჿᲐ-Ჿ]/, `${code} is not in Georgian`)
  }
})
