# LYNE Mobile

A standalone, installable Progressive Web App (PWA) for phones and tablets. Open it in a browser and add it to the home screen; it launches in its own app-style window without an App Store or Play Store install.

## Add LYNE to your home screen

- **iPhone / iPad:** open the LYNE Mobile URL in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open the LYNE Mobile URL in Chrome, open the menu, then tap **Install app** or **Add to Home screen**.

The PWA manifest, iOS home-screen icon, standalone display mode and service worker are included. The service worker caches the app shell for repeat visits and basic offline launch. Music catalogue/API requests are never cached as app-shell files.

## Run locally

```sh
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_URL` to the deployed first-party LYNE API origin. Until that backend is deployed and configured, local audio import and the on-device app features remain available, while remote catalogue/search/account sync report the missing API rather than redirecting elsewhere.

## Publish

GitHub Actions builds and deploys `dist` to GitHub Pages on pushes to `main`. In the repository's **Settings → Pages**, set the source to **GitHub Actions**. Once the LYNE API is deployed, add a repository Actions variable named `VITE_API_URL`.

## Project boundaries

- This repository is independent from the LYNE Windows application repository.
- The Windows app is used as a read-only reference for design and feature direction.
- No third-party legacy music API or API proxy is configured or called.
- The mobile client only talks to the first-party LYNE API configured via `VITE_API_URL`.
- The API host is intentionally blank by default. The API must be a separately deployed LYNE-owned service.

## Current mobile foundation

Mobile navigation, home/search/library/stats/profile views, expandable playback controls, queue controls, local audio import and playback, likes, playlist creation, profile picture selection, appearance and playback settings, listening-time stats, top-10 song/artist rankings, and share-your-stats text sharing are included. Remote music catalogue, account sync, playlist image cloud sync, lyrics, downloads/offline media and synced history need the LYNE API and media catalogue to be implemented and deployed.
