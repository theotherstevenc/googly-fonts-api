const assert = require('node:assert/strict')
const { once } = require('node:events')
const { describe, it } = require('node:test')

const { createApp } = require('./app')
const { fetchGoogleFonts, GoogleFontsError } = require('./services/googleFonts')

const listen = async (t, options) => {
  const server = createApp(options).listen(0, '127.0.0.1')
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

const items = ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Raleway']
  .map((family) => ({ family }))

describe('createApp', () => {
  it('returns the default number of fonts in upstream order', async (t) => {
    const sorts = []
    const baseUrl = await listen(t, {
      fetchFonts: async (sortBy) => {
        sorts.push(sortBy)
        return { items }
      },
    })

    const response = await fetch(baseUrl)

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      fonts: ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald'],
      count: 5,
      limit: 5,
      sortBy: 'popularity',
    })
    assert.deepEqual(sorts, ['popularity'])
  })

  it('passes accepted sorts upstream and applies query normalization', async (t) => {
    const sorts = []
    const baseUrl = await listen(t, {
      fetchFonts: async (sortBy) => {
        sorts.push(sortBy)
        return { items }
      },
    })

    for (const sort of ['popularity', 'alpha', 'date', 'trending']) {
      const response = await fetch(`${baseUrl}/?limit=2abc&sort=${sort}`)
      assert.deepEqual(await response.json(), {
        fonts: ['Roboto', 'Open Sans'],
        count: 2,
        limit: 2,
        sortBy: sort,
      })
    }
    assert.deepEqual(sorts, ['popularity', 'alpha', 'date', 'trending'])

    const response = await fetch(`${baseUrl}/?limit=101&sort=unknown`)
    const data = await response.json()
    assert.equal(data.limit, 5)
    assert.equal(data.sortBy, 'popularity')
  })

  it('handles boundary limits and fewer available fonts', async (t) => {
    const baseUrl = await listen(t, { fetchFonts: async () => ({ items }) })

    for (const [limit, count] of [[1, 1], [100, 6]]) {
      const response = await fetch(`${baseUrl}/?limit=${limit}`)
      assert.deepEqual(await response.json(), {
        fonts: items.slice(0, limit).map((item) => item.family),
        count,
        limit,
        sortBy: 'popularity',
      })
    }
  })

  it('returns a successful empty result for an empty catalog', async (t) => {
    const baseUrl = await listen(t, { fetchFonts: async () => ({ items: [] }) })

    const response = await fetch(baseUrl)

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      fonts: [],
      count: 0,
      limit: 5,
      sortBy: 'popularity',
    })
  })

  it('returns a liveness timestamp without calling the upstream service', async (t) => {
    const baseUrl = await listen(t, {
      fetchFonts: () => assert.fail('Health must not fetch fonts'),
    })

    const response = await fetch(`${baseUrl}/health`)
    const data = await response.json()

    assert.equal(response.status, 200)
    assert.equal(data.status, 'OK')
    assert.equal(new Date(data.timestamp).toISOString(), data.timestamp)
  })

  it('keeps permissive CORS and returns JSON for unknown endpoints', async (t) => {
    const baseUrl = await listen(t, {
      fetchFonts: () => assert.fail('Unknown endpoints must not fetch fonts'),
    })

    const response = await fetch(`${baseUrl}/unknown`, {
      headers: { Origin: 'https://example.com' },
    })

    assert.equal(response.status, 404)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.deepEqual(await response.json(), { error: 'Endpoint not found' })
  })

  it('rejects malformed catalogs through the upstream service', async (t) => {
    let catalog
    const logs = []
    const baseUrl = await listen(t, {
      fetchFonts: (sortBy) => fetchGoogleFonts(sortBy, {
        apiBaseUrl: 'https://example.com/fonts',
        apiKey: 'test-key',
        fetchImpl: async () => Response.json(catalog),
      }),
      logger: { error: (...args) => logs.push(args) },
    })

    for (const data of [null, { items: {} }, { items: [{ family: null }] }]) {
      catalog = data
      const response = await fetch(baseUrl)
      assert.equal(response.status, 500)
      assert.deepEqual(await response.json(), {
        error: 'Invalid response from Google Fonts API',
      })
    }
    assert.equal(logs.length, 3)
  })

  it('reports upstream failures with an HTTP 500 error envelope', async (t) => {
    const logs = []
    const baseUrl = await listen(t, {
      fetchFonts: async () => { throw new GoogleFontsError('network') },
      logger: { error: (...args) => logs.push(args) },
    })

    const response = await fetch(baseUrl)
    const data = await response.json()

    assert.equal(response.status, 500)
    assert.equal(data.error, 'Failed to fetch fonts')
    assert.equal(data.message, 'Unable to retrieve fonts. Please try again.')
    assert.equal(logs.length, 1)
  })

  it('returns a safe HTTP 500 for a timed-out upstream request', async (t) => {
    const logs = []
    const baseUrl = await listen(t, {
      fetchFonts: (sortBy) => fetchGoogleFonts(sortBy, {
        apiBaseUrl: 'https://example.com/fonts',
        apiKey: 'test-key',
        timeoutMs: 30,
        fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
      }),
      logger: { error: (...args) => logs.push(args) },
    })

    const response = await fetch(baseUrl)

    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), {
      error: 'Failed to fetch fonts',
      message: 'Unable to retrieve fonts. Please try again.',
    })
    assert.deepEqual(logs, [['Error fetching fonts:', {
      category: 'timeout',
      status: undefined,
    }]])
  })

  it('keeps raw network exceptions out of responses and logs', async (t) => {
    const secret = 'sentinel-api-key'
    const logs = []
    const baseUrl = await listen(t, {
      fetchFonts: (sortBy) => fetchGoogleFonts(sortBy, {
        apiBaseUrl: 'https://example.com/fonts',
        apiKey: secret,
        fetchImpl: async () => {
          throw new Error(`Failed to fetch https://example.com/fonts?key=${secret}`)
        },
      }),
      logger: { error: (...args) => logs.push(args) },
    })

    const response = await fetch(baseUrl)
    const body = await response.text()

    assert.equal(response.status, 500)
    assert.equal(JSON.parse(body).error, 'Failed to fetch fonts')
    assert.ok(!body.includes(secret))
    assert.ok(!JSON.stringify(logs).includes(secret))
    assert.equal(logs.length, 1)
  })

  it('reports unexpected failures without exposing their details', async (t) => {
    const secret = 'sentinel-api-key'
    const logs = []
    const baseUrl = await listen(t, {
      fetchFonts: async () => { throw new Error(`Unexpected error: ${secret}`) },
      logger: { error: (...args) => logs.push(args) },
    })

    const response = await fetch(baseUrl)

    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'Internal server error' })
    assert.deepEqual(logs, [['Unhandled request error']])
  })

  it('handles malformed request JSON without logging its contents', async (t) => {
    const logs = []
    const baseUrl = await listen(t, {
      fetchFonts: () => assert.fail('Invalid JSON must not reach the route'),
      logger: { error: (...args) => logs.push(args) },
    })

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key":"sentinel-api-key",',
    })

    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'Internal server error' })
    assert.deepEqual(logs, [['Unhandled request error']])
  })
})
