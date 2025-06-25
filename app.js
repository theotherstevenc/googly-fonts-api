const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

// Validation helpers
const validateLimit = (limit) => {
  const num = parseInt(limit, 10)
  return isNaN(num) || num < 1 || num > 100 ? 5 : num
}

const validateSort = (sort) => {
  const validSorts = ['popularity', 'alpha', 'date', 'trending']
  return validSorts.includes(sort) ? sort : 'popularity'
}

// Google Fonts API service
const fetchGoogleFonts = async (sortBy) => {
  const { API_BASE_URL, API_KEY } = process.env

  if (!API_BASE_URL || !API_KEY) {
    throw new Error('Missing required environment variables: API_BASE_URL or API_KEY')
  }

  const response = await fetch(`${API_BASE_URL}?key=${API_KEY}&sort=${sortBy}`)

  if (!response.ok) {
    throw new Error(`Google Fonts API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

// Routes
app.get('/', async (req, res) => {
  try {
    const limit = validateLimit(req.query.limit)
    const sortBy = validateSort(req.query.sort)

    const data = await fetchGoogleFonts(sortBy)

    if (!data.items || !Array.isArray(data.items)) {
      return res.status(500).json({ error: 'Invalid response from Google Fonts API' })
    }

    const fontFamilies = data.items.map((item) => item.family).slice(0, limit)

    res.json({
      fonts: fontFamilies,
      count: fontFamilies.length,
      limit,
      sortBy,
    })
  } catch (error) {
    console.error('Error fetching fonts:', error.message)
    res.status(500).json({
      error: 'Failed to fetch fonts',
      message: error.message,
    })
  }
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`🚀 Google Fonts API server running on port ${PORT}`)
  console.log(`📍 Health check: http://localhost:${PORT}/health`)
})
