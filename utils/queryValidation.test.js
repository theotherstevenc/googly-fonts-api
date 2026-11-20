const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const { validateLimit, validateSort } = require('./queryValidation')

describe('validateLimit', () => {
  it('defaults missing, invalid, and out-of-range values to five', () => {
    for (const value of [undefined, '', 'abc', '0', '-1', '101', 'Infinity', {}]) {
      assert.equal(validateLimit(value), 5)
    }
  })

  it('accepts both boundaries and preserves parseInt normalization', () => {
    for (const [value, expected] of [
      ['1', 1],
      ['100', 100],
      ['10abc', 10],
      ['2.5', 2],
      [' 3 ', 3],
      [['4', '8'], 4],
    ]) {
      assert.equal(validateLimit(value), expected)
    }
  })
})

describe('validateSort', () => {
  it('accepts each supported sort', () => {
    for (const value of ['popularity', 'alpha', 'date', 'trending']) {
      assert.equal(validateSort(value), value)
    }
  })

  it('defaults missing and unsupported sorts to popularity', () => {
    for (const value of [undefined, '', 'POPULARITY', 'style', ['alpha'], {}]) {
      assert.equal(validateSort(value), 'popularity')
    }
  })
})
