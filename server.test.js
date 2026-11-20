const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { describe, it } = require('node:test')

const testEnv = {
  ...process.env,
  API_BASE_URL: 'https://example.com/fonts',
  API_KEY: 'test-key',
  PORT: '',
  DOTENV_CONFIG_PATH: '/dev/null',
}

const runNode = (args, env = {}) => spawnSync(process.execPath, args, {
  cwd: __dirname,
  env: { ...testEnv, ...env },
  encoding: 'utf8',
  timeout: 5000,
})

const listen = async (t, handler, shouldBindAllInterfaces = false) => {
  const server = createServer(handler)
  t.after(() => new Promise((resolve, reject) => {
    if (!server.listening) return resolve()
    server.close((error) => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  server.listen({
    port: 0,
    host: shouldBindAllInterfaces ? undefined : '127.0.0.1',
  })
  await once(server, 'listening')
  return server
}

describe('server startup', () => {
  it('allows importing the application and entry point without starting a server', () => {
    const result = runNode(['-e', "require('./app'); require('./server')"], {
      API_BASE_URL: '',
      API_KEY: '',
    })

    assert.equal(result.error, undefined)
    assert.equal(result.status, 0)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
  })

  it('fails before listening when configuration is invalid', () => {
    for (const [env, diagnostic] of [
      [{ API_BASE_URL: '' }, 'API_BASE_URL is required'],
      [{ API_KEY: '   ' }, 'API_KEY is required'],
      [{ API_BASE_URL: 'invalid-sentinel-key' }, 'API_BASE_URL must be a valid HTTP(S) URL'],
      [{ PORT: '3000abc' }, 'PORT must be an integer from 1 to 65535'],
    ]) {
      const result = runNode(['server.js'], env)

      assert.equal(result.error, undefined)
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.ok(result.stderr.includes(diagnostic))
      assert.ok(!result.stderr.includes('sentinel-key'))
    }
  })

  it('reports a listener failure without an unhandled error', async (t) => {
    const occupied = await listen(t, (_req, res) => res.end(), true)

    const result = runNode(['server.js'], { PORT: String(occupied.address().port) })

    assert.equal(result.error, undefined)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), 'Failed to start server: unable to open listener')
  })

  it('serves requests using a real local upstream and safely reports its failures',
    { timeout: 10000 }, async (t) => {
      const secret = 'sentinel-key&with=special'
      const requests = []
      let mode = 'valid'
      const upstream = await listen(t, (req, res) => {
        requests.push(new URL(req.url, 'http://localhost'))
        if (mode === 'http-error') {
          res.writeHead(403, { 'Content-Type': 'text/plain' })
          return res.end(secret)
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(mode === 'invalid-catalog'
          ? { items: [{ family: null }] }
          : { items: [{ family: 'Roboto' }, { family: 'Open Sans' }] }))
      })

      const reservation = await listen(t, (_req, res) => res.end())
      const port = reservation.address().port
      await new Promise((resolve) => reservation.close(resolve))
      const child = spawn(process.execPath, ['server.js'], {
        cwd: __dirname,
        env: {
          ...testEnv,
          PORT: String(port),
          API_BASE_URL: `http://127.0.0.1:${upstream.address().port}/fonts`,
          API_KEY: secret,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const exited = once(child, 'exit')
      let output = ''
      let errors = ''
      child.stderr.on('data', (chunk) => { errors += chunk })
      t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGTERM')
        }
        await exited
      })

      await new Promise((resolve, reject) => {
        child.stdout.on('data', (chunk) => {
          output += chunk
          if (output.includes('Google Fonts API server running')) resolve()
        })
        child.once('error', reject)
        child.once('exit', () => reject(new Error('Server exited before becoming ready')))
      })

      const baseUrl = `http://127.0.0.1:${port}`
      const health = await fetch(`${baseUrl}/health`)
      assert.equal(health.status, 200)
      assert.equal((await health.json()).status, 'OK')
      assert.equal(requests.length, 0)

      const fonts = await fetch(`${baseUrl}/?limit=1&sort=alpha`)
      assert.equal(fonts.status, 200)
      assert.deepEqual(await fonts.json(), {
        fonts: ['Roboto'],
        count: 1,
        limit: 1,
        sortBy: 'alpha',
      })
      assert.equal(requests[0].pathname, '/fonts')
      assert.equal(requests[0].searchParams.get('sort'), 'alpha')
      assert.equal(requests[0].searchParams.get('key'), secret)

      mode = 'http-error'
      const failure = await fetch(baseUrl)
      assert.equal(failure.status, 500)
      assert.deepEqual(await failure.json(), {
        error: 'Failed to fetch fonts',
        message: 'Unable to retrieve fonts. Please try again.',
      })

      mode = 'invalid-catalog'
      const malformed = await fetch(baseUrl)
      assert.equal(malformed.status, 500)
      assert.deepEqual(await malformed.json(), {
        error: 'Invalid response from Google Fonts API',
      })

      const unknown = await fetch(`${baseUrl}/unknown`)
      assert.equal(unknown.status, 404)
      assert.deepEqual(await unknown.json(), { error: 'Endpoint not found' })
      assert.equal(requests.length, 3)
      assert.ok(!output.includes(secret))
      assert.ok(!errors.includes(secret))
    })
})
