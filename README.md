# Googly Fonts API

A small Express API for getting font family names from Google Fonts.

## Setup

To get started, use Node.js 22 or newer with npm:

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

The server checks these settings before starting. If a required value is
missing or blank, or the URL or port needs attention, it exits with a nonzero
code and a message to help you update the configuration.

You can keep your API key in `.env`, which is ignored by Git, or provide it
through your environment.

## Endpoints

### `GET /`

```sh
curl 'http://localhost:3000/?limit=2&sort=popularity'
```

Here's an example response. The font order comes from Google:

```json
{
  "fonts": ["Roboto", "Open Sans"],
  "count": 2,
  "limit": 2,
  "sortBy": "popularity"
}
```

- `limit`: from 1 to 100; missing, invalid, or out-of-range values default to 5.
  Limits are read as integers, so values such as `2abc` and `2.5` become 2.
- `sort`: `popularity`, `alpha`, `date`, or `trending`; defaults to `popularity`
  for missing or unsupported values.
- `count` tells you how many fonts were returned. This may be fewer than
  `limit`; an empty catalog returns an empty `fonts` array and count 0.

Font results are fetched from Google for each request, without caching or
automatic retries. A 10-second timeout covers fetching and reading the JSON
response, so a stalled upstream request doesn't leave callers waiting.

If Google is unavailable, the request times out, or its response can't be used,
the API returns HTTP 500 with one of the messages below. This includes invalid
JSON and catalogs with missing or empty family names. Error responses use short
messages, while logs record failure categories and available HTTP status codes
rather than raw upstream exception details.

For an unusable font catalog:

```json
{ "error": "Invalid response from Google Fonts API" }
```

For other upstream request failures:

```json
{
  "error": "Failed to fetch fonts",
  "message": "Unable to retrieve fonts. Please try again."
}
```

### `GET /health`

Returns `{"status":"OK","timestamp":"<ISO timestamp>"}` to confirm the server
is running. The check responds locally rather than contacting Google, so it
doesn't indicate Google's availability. As with the other endpoints, the
server needs to start successfully before this check is available.

Unknown endpoints return HTTP 404 with `{"error":"Endpoint not found"}`.
Browser requests from any origin are currently allowed
(`Access-Control-Allow-Origin: *`).

## Development

```sh
npm test
```

The tests run with Node's built-in test runner, stubbed fetches, and local HTTP
servers. They use test data rather than real credentials, Google requests, or
your `.env` file.

`app.js` exports `createApp({ fetchFonts, logger })` without starting a server.
`server.js` loads environment configuration and starts listening. Configuration,
upstream communication, and query normalization live in `config.js`,
`services/googleFonts.js`, and `utils/queryValidation.js`.
