# LYNE's first-party music backend

This service is a new LYNE-owned API, not a proxy. It uses:
- **Cloudflare Workers** for API routing and authentication.
- **Cloudflare D1** for user accounts, artists, albums, track metadata, playlists and listening events.
- **Cloudflare R2** for audio files and artwork, delivered by the Worker with HTTP byte-range support for seeking.

Cloudflare documents D1 bindings and prepared SQL queries, R2 object storage and ranged reads here:
- https://developers.cloudflare.com/d1/worker-api/
- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- https://developers.cloudflare.com/workers/wrangler/configuration/

## Deploy it

You need a Cloudflare account. From this directory:

```sh
npm install
npx wrangler login
npx wrangler d1 create lyne-catalog
npx wrangler r2 bucket create lyne-media
```

Copy the D1 database ID from the first command into `wrangler.toml` where it says `REPLACE_WITH_D1_DATABASE_ID`, then:

```sh
npx wrangler d1 migrations apply lyne-catalog --remote
npx wrangler secret put ADMIN_API_TOKEN
npx wrangler secret put AUTH_SECRET
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npx wrangler secret put SOUNDCLOUD_CLIENT_ID
npx wrangler secret put SOUNDCLOUD_CLIENT_SECRET
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put APPLE_MUSIC_DEVELOPER_TOKEN
npx wrangler deploy
```

Generate long random secrets, for example with `openssl rand -base64 48`. Do not commit secret values. Set `CORS_ORIGIN` in `wrangler.toml` to your exact mobile app origin after Pages is enabled (for example `https://sixseriess.github.io`). Wildcard is only the starter default.

The four provider integrations use official metadata APIs. Add each provider's credentials as Worker secrets (leave a provider unconfigured until its developer app is approved). Spotify and SoundCloud public resources use app tokens; YouTube uses a Data API key; Apple Music uses a signed developer token. Private or user-library resources need the relevant user authorization flow, which is not included in this initial public-link resolver.

Then set `VITE_API_URL` in the LYNE-MOBILE GitHub repository's Actions variables to the deployed Worker URL and rebuild the mobile site.

## Add catalogue content

Use `POST /v1/admin/tracks` with the `x-admin-token` header and multipart form fields:
- `title`, `artist`, optional `album`, `durationMs`, `genre`, `explicit`
- `audio` (MP3, AAC, M4A, WAV, FLAC, OGG, OPUS or WebM, up to 45 MB)
- optional `artwork` (JPG, PNG, WebP or AVIF, up to 7 MB)
- `rightsConfirmed=true`, `rightsStatus=owned|licensed|public_domain`, and `rightsReference`

The admin token is a server secret and must never be placed in the mobile app. Tracks are only added through this authenticated admin route. You must have the right to distribute every recording and artwork you upload. The rights fields are an audit declaration, not a substitute for a licence.

## API routes

Public:
- `GET /v1/health`
- `GET /v1/home`
- `GET /v1/tracks?limit=30&offset=0`
- `GET /v1/artists?q=`
- `GET /v1/artists/:id`
- `GET /v1/albums?q=`
- `GET /v1/albums/:id`
- `GET /v1/search?q=...&type=all|tracks|artists|albums|playlists`
- `GET|HEAD /v1/media/:key` (supports HTTP byte ranges)

Imports:
- `GET /v1/import/resolve?url=...` — resolve supported Spotify, SoundCloud, YouTube and Apple Music song, album or playlist links via the official provider API.
- `GET|POST /v1/me/imports` — list/save imported songs in Liked Songs and imported playlists/albums in the Library.

Account:
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `GET /v1/me`
- `GET|POST /v1/me/playlists`
- `POST /v1/me/listening`

Admin:
- `POST /v1/admin/tracks`

Imported provider content stays linked to its source. Metadata and permitted artwork URLs are stored with the source URL; audio is not downloaded, copied to R2, or re-streamed by LYNE. Spotify content must retain links and attribution, and Spotify content may not be downloaded or stream-ripped. YouTube imports use Data API metadata and official YouTube embeds; Apple Music items use catalogue links/MusicKit-compatible playback; SoundCloud items retain their official permalink/widget stream reference. See each provider's developer terms before enabling playback or caching.

The first-party LYNE catalogue and provider-link imports are separate. LYNE's own hosted catalogue remains empty until LYNE adds recordings it owns, recordings it has licensed, or public-domain recordings.
