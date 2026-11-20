const assert = require('node:assert/strict')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { describe, it } = require('node:test')

const { fetchGoogleFonts, GoogleFontsError } = require('./googleFonts')

const options = {
  apiBaseUrl: 'https://example.com/fonts',
  apiKey: 'test-key',
}

const expectFailure = (category, status) => (error) => {
  assert.ok(error instanceof GoogleFontsError)
  assert.equal(error.category, category)
  assert.equal(error.status, status)
  return true
}

const listen = async (t, handler) => {
  const server = createServer(handler)
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}/fonts`
}

describe('fetchGoogleFonts', () => {
  it('encodes credentials and sort while retaining unrelated base URL parameters', async () => {
    const requested = []
    const data = { items: [{ family: 'Roboto' }, { family: 'Open Sans' }] }

    const result = await fetchGoogleFonts('alpha', {
      ...options,
      apiBaseUrl: 'https://example.com/fonts?existing=yes&sort=date&key=old',
      apiKey: 'key&with=special?characters',
      fetchImpl: async (url, init) => {
        requested.push({ url: new URL(url), signal: init.signal })
        return Response.json(data)
      },
    })

    assert.deepEqual(result, data)
    assert.equal(requested.length, 1)
    assert.equal(requested[0].url.pathname, '/fonts')
    assert.equal(requested[0].url.searchParams.get('existing'), 'yes')
    assert.equal(requested[0].url.searchParams.get('sort'), 'alpha')
    assert.deepEqual(requested[0].url.searchParams.getAll('key'), [
      'key&with=special?characters',
    ])
    assert.ok(requested[0].signal instanceof AbortSignal)
  })

  it('accepts a valid empty catalog', async () => {
    const result = await fetchGoogleFonts('popularity', {
      ...options,
      fetchImpl: async () => Response.json({ items: [] }),
    })
    assert.deepEqual(result, { items: [] })
  })

  it('reports an upstream HTTP failure without including status text or body', async () => {
    await assert.rejects(fetchGoogleFonts('popularity', {
      ...options,
      fetchImpl: async () => new Response('secret-key', {
        status: 403,
        statusText: 'secret-key',
      }),
    }), expectFailure('http', 403))
  })

  it('reports network failures without retaining the raw exception', async () => {
    await assert.rejects(fetchGoogleFonts('popularity', {
      ...options,
      fetchImpl: async () => { throw new Error('Request failed for secret-key') },
    }), (error) => {
      expectFailure('network')(error)
      assert.ok(!String(error.stack).includes('secret-key'))
      assert.equal(error.cause, undefined)
      return true
    })
  })

  it('reports response cleanup failures as safe transport errors', async () => {
    await assert.rejects(fetchGoogleFonts('popularity', {
      ...options,
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        body: {
          cancel: async () => { throw new TypeError('Connection terminated: secret-key') },
        },
      }),
    }), expectFailure('network'))
  })

  it('distinguishes malformed JSON from body transport failures', async () => {
    await assert.rejects(fetchGoogleFonts('popularity', {
      ...options,
      fetchImpl: async () => new Response('{invalid-json'),
    }), expectFailure('invalid-json'))

    await assert.rejects(fetchGoogleFonts('popularity', {
      ...options,
      fetchImpl: async () => ({
        ok: true,
        json: async () => { throw new TypeError('Connection terminated: secret-key') },
      }),
    }), expectFailure('network'))
  })

  it('rejects malformed catalogs rather than filtering invalid entries', async () => {
    for (const data of [
      null,
      [],
      {},
      { items: {} },
      { items: [null] },
      { items: [{}] },
      { items: [{ family: 123 }] },
      { items: [{ family: '' }] },
      { items: [{ family: '   ' }] },
      { items: [{ family: 'Roboto' }, { family: null }] },
    ]) {
      await assert.rejects(fetchGoogleFonts('popularity', {
        ...options,
        fetchImpl: async () => Response.json(data),
      }), expectFailure('invalid-catalog'))
    }
  })

  it('aborts a request that never receives response headers', { timeout: 5000 }, async (t) => {
    const received = []
    const apiBaseUrl = await listen(t, (req) => received.push(req.url))

    await assert.rejects(fetchGoogleFonts('popularity', {
      ...options,
      apiBaseUrl,
      timeoutMs: 100,
    }), expectFailure('timeout'))
    assert.equal(received.length, 1)
  })

  it('keeps the timeout active while reading a stalled JSON body', { timeout: 5000 }, async (t) => {
    let isBodyStarted = false
    const apiBaseUrl = await listen(t, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('{"items":[')
      isBodyStarted = true
    })

    await assert.rejects(fetchGoogleFonts('popularity', {
      ...options,
      apiBaseUrl,
      timeoutMs: 100,
    }), expectFailure('timeout'))
    assert.equal(isBodyStarted, true)
  })
})
