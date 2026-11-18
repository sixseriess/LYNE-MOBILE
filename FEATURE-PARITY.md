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
- [x] Home page sections and personalized Daily Mix, On Repeat, Discovery Mix, and Recent Mix backed by LYNE catalogue data and listening history.
- [x] Search tracks, artists, albums, and playlists with working detail pages.
- [x] Artist profiles, album/collection pages, artwork, and track actions.
- [x] Recently played and popular catalogue sections with history-based mixes; shared listening-now presence remains outstanding.
- [ ] Loading, empty, offline, and API-error states throughout; search errors, API health, empty lists, and a global offline banner are implemented, but not every detail view has a dedicated retry state.

### Library and imports
- [x] Liked songs and locally imported audio files.
- [x] Create playlists and save external song / playlist / album links.
- [x] Full playlist editing: rename, description, account-synced custom artwork, reorder, remove tracks, and delete.
- [x] Local audio track title, artist, album and artwork editing is saved in IndexedDB alongside the audio; system-level file/folder access and cross-device local-file sync remain browser-limited.
- [x] Save individual first-party LYNE catalogue tracks to device storage for offline playback, with a configurable download limit and remove controls. Offline mixes remain a future enhancement.
- [x] Import preview, provider/source attribution, local duplicate detection, progress states, and retry of failed account sync from the still-open preview; bulk import reports partial sync failures.
- [x] Spotify, SoundCloud, YouTube, and Apple Music imports use provider metadata APIs and allowlisted official embed players where available, with HTTPS original-link fallback. Imports do not copy or rehost provider audio; backend credentials remain required.

### Player and audio
- [x] Basic playback UI, mini-player, expanded player, seek, volume, queue, shuffle, repeat, and likes.
- [x] Queue reorder/remove, stream-error feedback and Media Session controls are implemented; seamless gapless transitions and guaranteed background playback depend on the mobile browser and remain unverified.
- [x] Correct next / previous navigation, repeat-all behavior, autoplay-similar continuation, and remote queue persistence across PWA launches.
- [x] Expanded now-playing player with responsive artwork, artwork-backed ambient background, seeking and touch gestures.
- [x] Adjustable synced-lyrics offset (−5 to +5 seconds) is saved in device and account preferences; lyrics remain available from catalogue track metadata rather than a separate offline lyrics cache.
- [x] Catalogue tracks can carry plain-text or LRC timed lyrics, with current-line highlighting in the mobile player.
- [x] Mobile EQ / independent pitch limitations are explained with guidance to use OS or headphone audio settings.
- [x] Playback speed control (0.5×–2×); independent pitch shifting is not exposed consistently by iOS/Android PWAs and is explained in Playback settings.
- [x] Autoplay-similar continuation, Daily Mix / Discovery Mix / On Repeat / Recent Mix, and resume-or-empty playback context preference.
- [x] Audio-focus and output-routing limitations are explained; lock-screen and headset controls use supported browser APIs.
- [x] Media-session metadata and lock-screen / headset transport controls where supported (Media Session API handlers are present; device-specific behavior still needs iOS Safari and Android Chrome testing).

### Account, profile, and personalization
- [x] Basic LYNE account sign-in / registration UI, local profile image selection, R2-backed avatar upload/removal, and signed-in preference sync.
- [x] Best-effort account restore: temporary API failures retain the saved session, while explicit 401/403 responses clear rejected credentials; library, imports, listening history, preferences, and profile photos sync independently.
- [x] Signed-in username editing, avatar upload/removal, and preference sync; changing an account email remains unavailable without an email verification flow.
- [x] Profile picture is optimized and persists locally on the device.
- [x] Listening statistics for day / week / month / year with top-10 songs and artists; data availability depends on listening history.
- [x] Authenticated listening history can be retrieved from the LYNE API and restored across signed-in sessions.
- [x] Export and share branded LYNE listening-stat images (native file share where supported, image-save fallback elsewhere).
- [x] Previous-year LYNE Wrapped recap with total minutes and top-10 songs / artists, shown once prior-year listening history exists.

### Settings — map every Windows tab to mobile
- [x] Mobile OS/browser handles call interruptions and Bluetooth/audio routing; PWAs cannot reliably observe all device route changes. The desktop-only pause-on-focus switch is intentionally not presented as a working mobile control.
- [x] Master volume, playback speed, autoplay-similar, track tap behavior, default playback context, repeat, shuffle, and lossless-only source preference.
- [x] **Shortcuts:** replace keyboard/global hotkeys with player swipes (left/right for previous/next, up for queue, down for lyrics), headset/media buttons and vibration feedback where supported; explain unavailable OS-wide bindings.
- [x] Persistent mini-player and Media Session lock-screen/headset transport controls where supported; floating desktop overlay and Picture-in-Picture are not guaranteed by iOS/Android PWA browsers.
- [x] Discord Rich Presence limitation explained in Settings; a preference can be retained, but mobile-browser RPC is not available through this PWA.
- [ ] **YouTube:** mobile-safe sign-in and account playback / library sync only through supported official authorization flows; never embed desktop auth mechanisms.
- [x] System theme detection is implemented; full Windows language/translation parity remains outstanding.
- [x] Dark / light / system theme, reduce-motion preference, and persistent custom background images. English is the only mobile UI language at this stage.
- [x] **Storage:** device usage, local music management, catalogue-track offline saves with a configurable limit, and safe temporary-cache clearing. Offline mixes remain a future enhancement.
- [x] PWA version and build SHA shown in About; checks for service-worker updates on launch and refreshes when a new worker takes control.
- [x] Support link points to the LYNE Discord invite; API deployment documentation and repository links are available.

### Install and release checks
- [x] Regenerated LYNE-branded 192px / 512px PNG and 180px iOS Apple touch icons, with icon links and service-worker cache refresh. Installed-icon verification remains a real-device release check.
- [ ] Publish the PWA after Cloudflare API configuration and device testing.

### Desktop-specific feature adaptations
- [ ] Custom backgrounds, artwork-backed home/player visuals and reduced-motion handling exist; automatic cover-colour extraction and selectable ambient visual modes remain outstanding.
- [x] API health/status indicator, online/offline detection, global offline notice, and offline catalogue-track playback; not all remote pages can be retried offline.
- [ ] App-shell assets are cached by the service worker and first-party media responses use immutable cache headers; a separate controlled cover cache for cross-origin provider artwork remains outstanding.
- [x] Desktop window controls, native overlay windows, system tray, global hotkeys and filesystem folder pickers are replaced with mobile PWA equivalents or explained limitations.
- [ ] Common controls have accessible labels, modal semantics, Escape dismissal, focus containment and return, and live status announcements; non-English translations and a full accessibility audit remain outstanding.

## Current implementation snapshot

The current mobile client includes playlist search/detail pages, playlist editing and R2 artwork, account session recovery, profile-photo and preferences sync, individual offline catalogue downloads, queue reorder/remove, adjustable timed lyrics, player swipe gestures, haptics, system theme and reduced-motion behavior, import duplicate/progress handling, an offline banner, and PWA update checks. Some features still rely on Cloudflare account configuration or provider OAuth, and platform-specific behavior needs device validation. The mobile accent and install icons use LYNE's lime-and-dark visual identity.

This snapshot is not a completion claim. Any unchecked item remains work to do, and each feature must be tested on both iOS Safari (installed PWA) and Android Chrome (installed PWA) before release.
