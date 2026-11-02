# LYNE Mobile

A standalone, installable Progressive Web App (PWA) for phones and tablets. Open it in a browser and add it to the home screen; it launches in its own app-style window without an App Store or Play Store install.

## Add LYNE to your home screen
- **iPhone / iPad:** open the LYNE Mobile URL in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open the LYNE Mobile URL in Chrome, open the menu, then tap **Install app** or **Add to Home screen**.

The PWA manifest, iOS home-screen icon, standalone display mode and service worker are included. The service worker caches the app shell for repeat visits and basic offline launch.

## Run locally
```sh
npm install
cp .env.example .env
npm run dev
```
Set `VITE_API_URL` to the deployed first-party LYNE API origin. Until that backend is deployed and configured, local audio import and on-device features remain available, while remote catalogue/search/account sync report the missing API.

## Publish the mobile app
GitHub Actions builds and deploys `dist` to GitHub Pages on pushes to `main`. In repository **Settings → Pages**, set the source to **GitHub Actions**. The first deployment will fail until Pages is enabled.

## LYNE's own catalogue backend
The `backend/` folder contains LYNE's own Cloudflare Worker API, D1 migration and R2 media-storage integration. See [backend/README.md](backend/README.md) for deployment and catalogue upload instructions. This is a new backend, not a proxy to another music service.

## Project boundaries
- This repository is independent from the LYNE Windows application repository.
- The Windows app is used as a read-only reference for design and feature direction.
- No legacy third-party music API or API proxy is configured or called.
- The mobile client only talks to the first-party LYNE API configured via `VITE_API_URL`.
- A complete commercial music catalogue requires a separate distribution licence and authorized catalogue source. Canadian rights holders include record-label/master-rights organizations and songwriter/publisher organizations; see [Music Canada](https://musiccanada.com/resources/licensing/) and [CMRRA](https://cmrra.ca/get-licensed/).

## Current mobile foundation
Mobile navigation, expandable playback controls, queue controls, local audio import/playback, likes, playlist creation, profile picture selection, playback settings, listening stats, top-10 song/artist rankings and share-your-stats are included. Remote commercial catalogue, account sync, synced playlist covers, lyrics, hosted downloads and media streaming require the LYNE backend and catalogue to be deployed and populated.
