# LYNE's first-party music backend

This service is a first-party LYNE API. It uses:
- **Cloudflare Workers** for API routing and authentication.
- **Cloudflare D1** for user accounts, artists, albums, track metadata, playlists and listening events.
- **Cloudflare R2** for audio files and artwork, delivered by the Worker with HTTP byte-range support for seeking.

Cloudflare references:
- [D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Workers configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

## One-click setup and deployment

The repository includes **Actions → Deploy LYNE API**. It now creates or reuses the `lyne-catalog` D1 database and `lyne-media` R2 bucket automatically, applies migrations, deploys the Worker, and installs the private secrets.

You only need to provide the Cloudflare account credentials and two LYNE secrets:

1. Open [LYNE-MOBILE repository secrets](https://github.com/sixseriess/LYNE-MOBILE/settings/secrets/actions).
2. Add these four **repository secrets**:
   - `CLOUDFLARE_API_TOKEN` — Cloudflare API token with **D1:Edit**, **Workers Scripts:Edit**, and **R2 Storage:Edit** permissions for your account.
   - `CLOUDFLARE_ACCOUNT_ID` — your 32-character Cloudflare account ID.
   - `LYNE_AUTH_SECRET` — a long random secret (at least 32 characters). Keep it stable between deployments; changing it signs every existing user out.
   - `LYNE_ADMIN_API_TOKEN` — a separate random admin token (at least 24 characters).
3. Open [Deploy LYNE API](https://github.com/sixseriess/LYNE-MOBILE/actions/workflows/deploy-api.yml), select **Run workflow**, and run it on `main`.
4. Copy the Worker URL from the workflow log. In LYNE Mobile, open **Settings → About → API URL**, paste the URL, and test the connection. You can also set the repository Actions variable `VITE_API_URL` to that URL and rebuild the Pages site so new installs get it automatically.

Generate both LYNE secrets locally with a password manager or a cryptographically secure random generator. Do not commit secrets or paste them into source code, chat messages, or any `VITE_*` variable. The deployment workflow never prints secret values.

The Cloudflare API token is used only by the GitHub Actions workflow. The setup script creates the named resources only when they do not already exist, so rerunning deployment does not replace or delete your database or media bucket. The D1 database is requested in the western North America region when Cloudflare makes that location available.

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

Imported provider content stays linked to its source. Metadata and permitted artwork URLs are stored with the source URL; LYNE does not download provider audio or re-stream it. Spotify content must retain links and attribution, and Spotify content may not be downloaded or stream-ripped. YouTube imports use Data API metadata and official YouTube embeds; Apple Music items use catalogue links/MusicKit-compatible playback; SoundCloud items retain their official permalink/widget stream reference. Follow each provider's developer terms before enabling playback or caching.

The first-party LYNE catalogue and provider-link imports are separate. LYNE's own hosted catalogue remains empty until LYNE adds recordings it owns, recordings it has licensed, or public-domain recordings.

## Optional provider integrations

Add provider credentials as Worker secrets only when those integrations are approved and ready:
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
- `SOUNDCLOUD_CLIENT_ID`, `SOUNDCLOUD_CLIENT_SECRET`
- `YOUTUBE_API_KEY`
- `APPLE_MUSIC_DEVELOPER_TOKEN`

Spotify and SoundCloud public resources use app tokens; YouTube uses a Data API key; Apple Music uses a signed developer token. Private or user-library resources need their own user authorization flow, which is not included in this public-link resolver.

For local development, run `npm install`, `npx wrangler dev` in `backend/`. Do not run a production deploy until the Cloudflare secrets above are configured.
