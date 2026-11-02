# LYNE Mobile — Windows Feature Parity

This is the acceptance checklist for LYNE Mobile. The Windows application is the read-only reference; all implementation work belongs in this repository.

## Non-negotiable boundaries

- Keep `sixseriess/LYNE-MOBILE` independent from the Windows repository.
- Never edit, move, delete, or release files in the Windows app.
- The mobile client may call only the first-party LYNE API configured by `VITE_API_URL`.
- Do not add the legacy Liner API, Liner endpoints, or third-party API proxies.
- Preserve the LYNE visual identity while redesigning navigation, controls, dialogs, and layouts for touchscreens and safe areas.
- A desktop-only capability must receive a useful mobile equivalent or be clearly identified as unavailable on mobile; it must not disappear without an explanation.

## Feature inventory and acceptance criteria

### Core app and discovery
- [x] Mobile-first app shell and bottom navigation.
- [ ] Home page sections and personalized mixes backed by LYNE catalogue data.
- [ ] Search tracks, artists, albums, and playlists with working detail pages.
- [ ] Artist profiles, album/collection pages, artwork, and track actions.
- [ ] Recently played, popular tracks, and listening-now states.
- [ ] Loading, empty, offline, and API-error states throughout.

### Library and imports
- [x] Liked songs and locally imported audio files.
- [x] Create playlists and save external song / playlist / album links.
- [ ] Full playlist editing: rename, description, custom artwork, reorder, remove tracks, delete.
- [ ] Full local library management, metadata, artwork, and persistent file access where browser permissions allow.
- [ ] Cached / saved tracks and offline mixes with storage limits and clear-cache controls.
- [ ] Import review, duplicate handling, progress, retries, and source attribution.
- [ ] Spotify, SoundCloud, YouTube, and Apple Music imports must follow each provider's official terms and approved playback/embed path. Imports do not imply permission to copy or rehost audio.

### Player and audio
- [x] Basic playback UI, mini-player, expanded player, seek, volume, queue, shuffle, repeat, and likes.
- [ ] Robust playback engine: next/previous, queue editing and persistence, gapless behavior where supported, playback recovery, and background playback where the mobile platform permits it.
- [ ] Fullscreen / now-playing experience with responsive artwork and dynamic background.
- [ ] Synced lyrics, timed highlighting, lyrics offset, and lyrics cache.
- [ ] Equalizer and supported audio effects.
- [ ] Speed and pitch controls with mobile-safe controls.
- [ ] Radio / autoplay-similar behavior and playback context preferences.
- [ ] Audio focus and interruption handling (calls, alarms, route changes) using supported browser/device APIs.
- [ ] Media-session metadata and lock-screen / headset transport controls where supported.

### Account, profile, and personalization
- [x] Basic LYNE account sign-in / registration UI and local profile image selection.
- [ ] Reliable account restore, secure token lifecycle, sign-out cleanup, and sync for library, playlists, preferences, and stats.
- [ ] Profile editing and persistent avatar upload / sync.
- [ ] Listening history and full statistics, including day / week / month / year filters, top songs, top artists, and shareable stats.
- [ ] Yearly Wrapped and historical listening summaries, if present in the Windows app.

### Settings — map every Windows tab to mobile
- [ ] **Playback:** autoplay similar, track activation behavior adapted to touch, default playback context, pause on audio-device / route changes, plus all other player preferences.
- [ ] **Shortcuts:** replace keyboard/global hotkeys with touch gestures, headset/media buttons, and accessibility actions where supported; explain unavailable OS-wide bindings.
- [ ] **Overlay:** replace floating desktop overlay with a persistent mini-player, picture-in-picture where supported, and notification / lock-screen controls where supported.
- [ ] **Discord:** provide mobile-compatible Rich Presence/status behavior only where the platform and Discord integration permit it; otherwise explain the limitation and retain configurable preferences only if useful.
- [ ] **YouTube:** mobile-safe sign-in and account playback / library sync only through supported official authorization flows; never embed desktop auth mechanisms.
- [ ] **Appearance:** system / light / dark theme, language selection, and all supported visual customization.
- [ ] **Storage:** usage overview, cache limits, clear cache, local music management, saved downloads, and offline availability.
- [ ] **About:** app version, build information, support / documentation links, and update information appropriate to a PWA.

### Desktop-specific feature adaptations
- [ ] Dynamic backgrounds, cover color extraction, ambient visuals, and visual modes adapted for mobile performance and reduced-motion preferences.
- [ ] Connectivity diagnostics and useful offline / degraded-network behavior.
- [ ] Cover caching and safe image loading.
- [ ] Desktop-only window controls, native overlay windows, system tray, updater, filesystem folder pickers, and global hotkeys are not copied literally; provide mobile equivalents or a clear platform limitation.
- [ ] Preserve translations and accessible labels across the mobile UI.

## Current implementation snapshot

The current mobile client already contains a PWA shell, local audio import, basic playback controls, likes, playlist creation, profile image selection, basic settings, local listening stats, top-10 song / artist lists, share-your-stats, and a first-party API client / Worker backend foundation.

This snapshot is not a completion claim. Any unchecked item remains work to do, and each feature must be tested on both iOS Safari (installed PWA) and Android Chrome (installed PWA) before release.
