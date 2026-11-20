const { createApp } = require('./app')
const { readConfig } = require('./config')
const { fetchGoogleFonts } = require('./services/googleFonts')

const startServer = (env = process.env) => {
  const { port, ...config } = readConfig(env)
  const app = createApp({
    fetchFonts: (sortBy) => fetchGoogleFonts(sortBy, config),
  })
  const server = app.listen(port, () => {
    console.log(`Google Fonts API server running on port ${port}`)
    console.log(`Health check: http://localhost:${port}/health`)
  })
  server.on('error', () => {
    console.error('Failed to start server: unable to open listener')
    process.exitCode = 1
  })

  return server
}

if (require.main === module) {
  require('dotenv/config')
  try {
    startServer()
  } catch (error) {
    console.error('Failed to start server:', error.message)
    process.exitCode = 1
  }
}

module.exports = { startServer }
