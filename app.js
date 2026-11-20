const express = require('express')
const cors = require('cors')

const { GoogleFontsError } = require('./services/googleFonts')
const { validateLimit, validateSort } = require('./utils/queryValidation')

const createApp = ({ fetchFonts, logger = console }) => {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.get('/', async (req, res, next) => {
    try {
      const limit = validateLimit(req.query.limit)
      const sortBy = validateSort(req.query.sort)
      const data = await fetchFonts(sortBy)

      const fontFamilies = data.items.map((item) => item.family).slice(0, limit)

      res.json({
        fonts: fontFamilies,
        count: fontFamilies.length,
        limit,
        sortBy,
      })
    } catch (error) {
      if (!(error instanceof GoogleFontsError)) {
        return next(error)
      }

      logger.error('Error fetching fonts:', {
        category: error.category,
        status: error.status,
      })
      if (error.category === 'invalid-catalog') {
        return res.status(500).json({ error: 'Invalid response from Google Fonts API' })
      }
      res.status(500).json({
        error: 'Failed to fetch fonts',
        message: 'Unable to retrieve fonts. Please try again.',
      })
    }
  })

  app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() })
  })

  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' })
  })

  app.use((_error, _req, res, _next) => {
    logger.error('Unhandled request error')
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}

module.exports = { createApp }
