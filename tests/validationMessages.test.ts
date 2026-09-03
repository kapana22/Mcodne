import test from 'node:test'
import assert from 'node:assert/strict'
import { validationIssueMessage } from '../lib/validationMessages'

test('default Zod copy never reaches the Georgian interface', () => {
  assert.equal(
    validationIssueMessage({ message: 'Invalid input', code: 'invalid_value', path: ['email'] }),
    'ელფოსტა არასწორია.',
  )
  assert.equal(
    validationIssueMessage({ message: 'Too small: expected string to have >=2 characters', code: 'too_small', path: ['name'] }),
    'სახელი შეავსე სრულად.',
  )
})

test('intentional Georgian schema guidance is preserved', () => {
  assert.equal(
    validationIssueMessage({ message: 'ნომერი არასწორია', code: 'custom', path: ['phone'] }),
    'ნომერი არასწორია',
  )
})
