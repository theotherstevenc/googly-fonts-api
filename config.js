const readConfig = (env) => {
  const { API_BASE_URL: apiBaseUrl, API_KEY: apiKey } = env

  for (const [name, value] of [['API_BASE_URL', apiBaseUrl], ['API_KEY', apiKey]]) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${name} is required`)
    }
  }

  let url
  try {
    url = new URL(apiBaseUrl)
  } catch {
    throw new Error('API_BASE_URL must be a valid HTTP(S) URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API_BASE_URL must be a valid HTTP(S) URL')
  }

  const portValue = env.PORT || '3000'
  const port = Number(portValue)
  if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535')
  }

  return { apiBaseUrl: url.toString(), apiKey, port }
}

module.exports = { readConfig }
