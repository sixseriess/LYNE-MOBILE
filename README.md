# LYNE Mobile

A standalone, mobile-first LYNE music app. The UI uses the Windows app's design language (Inter, near-black surfaces, electric lime accent) while adapting navigation and playback for phones.

## Scope and separation

- This repository is independent from the Windows app repository.
- The Windows application is used as a read-only visual and feature reference.
- No Liner API, Liner proxy, or legacy music-service API is called by this project.
- Mobile requests use only the first-party LYNE API contract under `/v1`.
- Local audio files can be imported and played directly in the browser. Catalogue streaming, account sync, synced playlists, server-side listening history, and hosted downloads require the LYNE API deployment below.

## Run the mobile client

```sh
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_URL` to the deployed LYNE API origin. Leave it blank only while developing local-only UI and audio import.

## Deploy the LYNE API

The `api/worker` folder contains LYNE's own Cloudflare Worker API and D1 schema. Follow `api/worker/README.md` to create a D1 database, apply the schema, set the API signing secret, and deploy. This is a new backend; it is not a proxy.

## Deploy the mobile site

The GitHub Actions workflow builds the Vite site and publishes the `dist` folder to GitHub Pages. Configure Pages to use GitHub Actions in repository settings. Add `VITE_API_URL` as a repository Actions variable after the LYNE API is deployed.

## Feature status

The initial mobile foundation includes mobile navigation, expandable playback controls, queue, local file import/playback, likes, playlist creation, profile photo selection, appearance settings, listening-time tracking, top-10 song/artist rankings and shareable stats text. Remote search, catalogue playback, authenticated sync, lyrics, hosted downloads and remote media depend on the LYNE API and catalogue being deployed and populated. Features are not silently redirected to Liner or another API.
