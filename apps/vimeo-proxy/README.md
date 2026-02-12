# Vimeo Proxy

A Cloudflare Worker that extracts direct video URLs from domain-restricted Vimeo embeds using Puppeteer. The web app calls this to get playable HLS/MP4 URLs for council meeting videos.

## How It Works

1. Receives a Vimeo URL via `POST /api/vimeo-url`
2. Launches a headless browser with `@cloudflare/puppeteer`
3. Sets cookies and the whitelisted referer header
4. Navigates to the Vimeo player page and intercepts the config response
5. Extracts HLS, progressive MP4, or DASH URLs from the config
6. Returns `{ video_url, audio_url }` to the caller

## Setup

```bash
pnpm install
pnpm dev       # local dev with wrangler
pnpm deploy    # deploy to Cloudflare Workers
```

## Environment / Secrets

Configure via `wrangler.toml` (vars) or `wrangler secret put` (secrets):

| Variable | Type | Description |
|----------|------|-------------|
| `ALLOWED_ORIGINS` | var | Comma-separated allowed CORS origins |
| `API_KEY` | secret | Optional auth key (checked via `X-API-Key` header) |
| `VIMEO_COOKIES` | secret | Netscape-format cookies for authenticated Vimeo access |

The Worker also requires the `[browser]` binding for Puppeteer:

```toml
[browser]
binding = "BROWSER"
```

## API

### `POST /api/vimeo-url`

**Request:**
```json
{ "vimeo_url": "https://vimeo.com/436633879" }
```

**Headers:**
- `X-API-Key` — required if `API_KEY` secret is set

**Response:**
```json
{ "video_url": "https://...m3u8", "audio_url": "https://..." }
```
