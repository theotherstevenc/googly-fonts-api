const FETCH_TIMEOUT_MS = 10000

class GoogleFontsError extends Error {
  constructor(category, status) {
    super('Google Fonts request failed')
    this.name = 'GoogleFontsError'
    this.category = category
    this.status = status
  }
}

const fetchGoogleFonts = async (sortBy, {
  apiBaseUrl,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = FETCH_TIMEOUT_MS,
}) => {
  const url = new URL(apiBaseUrl)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('sort', sortBy)
  const signal = AbortSignal.timeout(timeoutMs)

  let response
  try {
    response = await fetchImpl(url, { signal })
  } catch {
    throw new GoogleFontsError(signal.aborted ? 'timeout' : 'network')
  }
  if (!response.ok) {
    try {
      await response.body?.cancel()
    } catch {
      throw new GoogleFontsError(signal.aborted ? 'timeout' : 'network')
    }
    throw new GoogleFontsError('http', response.status)
  }

  let data
  try {
    data = await response.json()
  } catch (error) {
    if (signal.aborted) {
      throw new GoogleFontsError('timeout')
    }
    throw new GoogleFontsError(error instanceof SyntaxError ? 'invalid-json' : 'network')
  }

  if (
    !data ||
    !Array.isArray(data.items) ||
    !data.items.every((item) => (
      item !== null &&
      typeof item === 'object' &&
      typeof item.family === 'string' &&
      item.family.trim().length > 0
    ))
  ) {
    throw new GoogleFontsError('invalid-catalog')
  }

  return data
}

module.exports = { fetchGoogleFonts, GoogleFontsError }
