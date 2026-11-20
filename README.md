# Googly Fonts API

A small Express API that returns font family names from Google Fonts.

## Setup

Requires Node.js 22 or newer and npm.

```sh
npm ci
cp .env.example .env
```

Set `API_KEY` in `.env` to your Google Fonts API key, then run:

```sh
npm start
```

| Variable | Purpose |
| --- | --- |
| `API_BASE_URL` | Required HTTP(S) Google Fonts endpoint; see `.env.example`. |
| `API_KEY` | Required server-side Google Fonts API key. |
| `PORT` | Optional integer from 1 to 65535; defaults to 3000 when absent or empty. |

Missing or blank required values, an invalid URL, or an invalid port stop
startup with a nonzero exit code. Keep `.env` untracked and never put real
credentials in source code.

## Endpoints

### `GET /`

```sh
curl 'http://localhost:3000/?limit=2&sort=popularity'
```

Example response (font ordering depends on Google):

```json
{
  "fonts": ["Roboto", "Open Sans"],
  "count": 2,
  "limit": 2,
  "sortBy": "popularity"
}
```

- `limit`: from 1 to 100; missing, invalid, or out-of-range values default to 5.
  Existing `parseInt` behavior is retained: `2abc` and `2.5` both become 2.
- `sort`: `popularity`, `alpha`, `date`, or `trending`; defaults to `popularity`
  for missing or unsupported values.
- `count` reflects returned fonts, which can be fewer than `limit`.
  An empty upstream catalog returns an empty `fonts` array and count 0.

Each request fetches Google Fonts; there is no cache or retry. A 10-second
timeout covers both fetching and reading the upstream JSON body. Invalid
catalogs (including missing or empty family names), network failures, invalid
JSON, upstream HTTP failures, and timeouts return HTTP 500. Error responses and
logs do not include API keys or raw upstream exception details.

Invalid catalogs return:

```json
{ "error": "Invalid response from Google Fonts API" }
```

Other upstream failures return:

```json
{
  "error": "Failed to fetch fonts",
  "message": "Unable to retrieve fonts. Please try again."
}
```

### `GET /health`

Returns `{"status":"OK","timestamp":"<ISO timestamp>"}`. This is a liveness
check, not a Google connectivity/readiness check. It does not contact Google
and is unavailable if configuration prevents startup.

Unknown endpoints return HTTP 404 with `{"error":"Endpoint not found"}`.
CORS remains permissive (`Access-Control-Allow-Origin: *`).

## Development

```sh
npm test
```

Tests use Node's built-in test runner, stubbed fetches, and local HTTP servers.
They do not use real credentials, call Google, or load the real `.env`.

`app.js` exports `createApp({ fetchFonts, logger })` without starting a server.
`server.js` loads environment configuration and starts listening. Configuration,
upstream communication, and query normalization live in `config.js`,
`services/googleFonts.js`, and `utils/queryValidation.js`.
