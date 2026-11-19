# LYNE's first-party music backend

This service is a first-party LYNE API. It uses:
- **Cloudflare Workers** for API routing and authentication.
- **Cloudflare D1** for user accounts, artists, albums, track metadata, playlists and listening events.
- **Supabase Storage** for audio files and artwork, delivered by the Worker with HTTP byte-range support for seeking.

Cloudflare references:
- [D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)
- [Supabase Storage API](https://supabase.com/docs/guides/storage)
- [Workers configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

## One-click setup and deployment

The repository includes **Actions → Deploy LYNE API**. It creates or reuses the `lyne-catalog` D1 database, applies migrations, deploys the Worker, and installs the private secrets. Create a public Supabase Storage bucket named `lyne-media` before deploying.

You need the Cloudflare account credentials, two LYNE authentication secrets, and the Supabase project URL and server secret key:

1. Open [LYNE-MOBILE repository secrets](https://github.com/sixseriess/LYNE-MOBILE/settings/secrets/actions).
2. Add these six **repository secrets**:
   - `CLOUDFLARE_API_TOKEN` — Cloudflare API token with **D1:Edit** and **Workers Scripts:Edit** permissions for your account.
   - `CLOUDFLARE_ACCOUNT_ID` — your 32-character Cloudflare account ID.
   - `LYNE_AUTH_SECRET` — a long random secret (at least 32 characters). Keep it stable between deployments; changing it signs every existing user out.
   - `LYNE_ADMIN_API_TOKEN` — a separate random admin token (at least 24 characters).
3. Open [Deploy LYNE API](https://github.com/sixseriess/LYNE-MOBILE/actions/workflows/deploy-api.yml), select **Run workflow**, and run it on `main`.
4. Copy the Worker URL from the workflow log. In LYNE Mobile, open **Settings → About → API URL**, paste the URL, and test the connection. You can also set the repository Actions variable `VITE_API_URL` to that URL and rebuild the Pages site so new installs get it automatically.

Generate both LYNE secrets locally with a password manager or a cryptographically secure random generator. Do not commit secrets or paste them into source code, chat messages, or any `VITE_*` variable. The deployment workflow never prints secret values.

The Cloudflare API token is used only by the GitHub Actions workflow. The setup script creates the D1 database only when it does not already exist. Supabase Storage is managed by Supabase, and the workflow uses the existing `lyne-media` bucket. The D1 database is requested in the western North America region when Cloudflare makes that location available.

## Add catalogue content

Use `POST /v1/admin/tracks` with the `x-admin-token` header and multipart form fields:
- `title`, `artist`, optional `album`, `durationMs`, `genre`, `explicit`
- `audio` (MP3, AAC, M4A, WAV, FLAC, OGG, OPUS or WebM, up to 45 MB)
- optional `artwork` (JPG, PNG, WebP or AVIF, up to 7 MB)
- optional `lyrics` (plain text or LRC timed lyrics, up to 50,000 characters)
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
- `PUT /v1/me/profile` — update the authenticated account username (3–24 letters, numbers or underscores)
- `GET|PUT /v1/me/preferences` — sync mobile preferences to the signed-in account
- `POST|DELETE /v1/me/avatar` — upload or remove the account profile photo in Supabase Storage
- `GET|POST /v1/me/playlists`
- `PUT|DELETE /v1/me/playlists/:id`
- `POST|DELETE /v1/me/playlists/:id/cover` — upload or remove account-synced playlist artwork
- `GET|POST /v1/me/listening` — retrieve and record per-track daily listening totals.

Admin:
- `POST /v1/admin/tracks`

Imported provider content stays linked to its source. LYNE stores provider metadata and permitted artwork, while provider-owned playback stays in the official provider player. LYNE does not download, copy, or re-host Spotify, Apple Music, YouTube, or SoundCloud recordings in its catalogue. SoundCloud custom-player playback uses the official SoundCloud API's signed HLS stream URLs and must show both uploader credit and the official SoundCloud logo linked to the original work.

The LYNE catalogue is separate from provider imports. Only recordings LYNE owns, has licensed for distribution, or can document as public domain may be uploaded to the catalogue. The rights confirmation and reference are required audit fields and do not replace an actual licence.

## Connect official provider playback

### Spotify

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. In LYNE Mobile, open **Settings → Connections → Spotify** and paste the app's **Client ID**.
3. Add the exact Redirect URI displayed in LYNE to the Spotify app settings:
   `https://sixseriess.github.io/LYNE-MOBILE/`
4. Press **Connect Spotify**, sign in, and authorize the requested playback scopes.
5. Spotify playback needs a **Spotify Premium** user account. Spotify apps are also subject to Spotify's developer policy: streaming integrations are not permitted for commercial projects without Spotify's prior written approval. Do not use this integration commercially unless LYNE has that approval.

Spotify's browser SDK runs on the user's device. The Client ID is public by design for the PKCE flow; do not put a Spotify client secret in the PWA.

### Apple Music

1. In the [Apple Developer account](https://developer.apple.com/account/resources/identifiers/list), create a MusicKit identifier and private key.
2. Generate a valid Apple Music developer token JWT for that identifier.
3. Add the token as the GitHub Actions repository secret `APPLE_MUSIC_DEVELOPER_TOKEN`.
4. Run [Deploy LYNE API](https://github.com/sixseriess/LYNE-MOBILE/actions/workflows/deploy-api.yml) to install the secret on the Worker.
5. In LYNE Mobile, open **Settings → Connections → Apple Music**, press **Connect Apple Music**, and authorize access. Full-length playback requires the user to have an active Apple Music subscription.

The Worker returns the developer token to MusicKit on the Web with `Cache-Control: no-store`; it never returns the Apple private signing key.

### SoundCloud

1. Register an API application in [SoundCloud for Developers](https://developers.soundcloud.com/). Current SoundCloud API credentials are available to eligible Artist Pro accounts.
2. Add `SOUNDCLOUD_CLIENT_ID` and `SOUNDCLOUD_CLIENT_SECRET` as GitHub Actions repository secrets.
3. Run [Deploy LYNE API](https://github.com/sixseriess/LYNE-MOBILE/actions/workflows/deploy-api.yml).
4. Refresh provider status in LYNE **Settings → Connections**.

LYNE uses SoundCloud's official Client Credentials flow for public resources and rejects blocked or preview-only tracks. SoundCloud's current public API can return HLS audio streams; LYNE uses native HLS where available and HLS.js in browsers without native HLS. The player links back to the SoundCloud track and shows the uploader with the official SoundCloud logo. Private tracks require a separate user authorization flow and are not covered by this public-resource integration.

### YouTube

YouTube imports provide metadata only. The YouTube Data API does not provide a full-length audio stream URL. LYNE does not rip or extract audio from YouTube videos. A YouTube import can play in LYNE only when a matching licensed recording already exists in Local Files or the LYNE catalogue.


For local development, run `npm install`, `npx wrangler dev` in `backend/`. Do not run a production deploy until the Cloudflare and Supabase secrets above are configured.


### Provider playback

- `GET /v1/providers/soundcloud/playback/:trackId` resolves a full-length SoundCloud stream using the configured official SoundCloud API client credentials. It rejects blocked, non-streamable, preview-only, and unsupported tracks, and returns the short-lived HTTPS media URL for the browser audio element. Configure `SOUNDCLOUD_CLIENT_ID` and `SOUNDCLOUD_CLIENT_SECRET` as Worker secrets; no credentials are exposed to the PWA.
- YouTube Data API/oEmbed is used for metadata imports only. The YouTube Data API does not return an audio stream URL. LYNE mobile plays an exact match from the LYNE catalogue or a local licensed audio file instead of silently substituting an embed or preview.
