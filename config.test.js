const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const { readConfig } = require('./config')

const validEnv = {
  API_BASE_URL: 'https://www.googleapis.com/webfonts/v1/webfonts',
  API_KEY: 'test-key',
}

describe('readConfig', () => {
  it('uses the default port or a valid explicitly configured port', () => {
    for (const [value, port] of [
      [undefined, 3000],
      ['', 3000],
      ['1', 1],
      ['8080', 8080],
      ['65535', 65535],
    ]) {
      assert.deepEqual(readConfig({ ...validEnv, PORT: value }), {
        apiBaseUrl: validEnv.API_BASE_URL,
        apiKey: validEnv.API_KEY,
        port,
      })
    }
  })

  it('rejects missing or blank required configuration with safe diagnostics', () => {
    for (const name of ['API_BASE_URL', 'API_KEY']) {
      for (const value of [undefined, '', '   ']) {
        assert.throws(
          () => readConfig({ ...validEnv, [name]: value }),
          { message: `${name} is required` },
        )
      }
    }
  })

  it('rejects invalid or non-HTTP URLs without disclosing their contents', () => {
    for (const value of ['not-a-url-secret', 'file:///secret-key', 'ftp://example.com']) {
      assert.throws(
        () => readConfig({ ...validEnv, API_BASE_URL: value }),
        { message: 'API_BASE_URL must be a valid HTTP(S) URL' },
      )
    }
    assert.equal(
      readConfig({ ...validEnv, API_BASE_URL: 'http://127.0.0.1:8080/fonts' }).apiBaseUrl,
      'http://127.0.0.1:8080/fonts',
    )
  })

  it('rejects invalid explicit ports instead of interpreting them as socket paths', () => {
    for (const value of ['0', '-1', '65536', '3000abc', '3.5', 'Infinity', 'socket']) {
      assert.throws(
        () => readConfig({ ...validEnv, PORT: value }),
        { message: 'PORT must be an integer from 1 to 65535' },
      )
    }
  })
})
