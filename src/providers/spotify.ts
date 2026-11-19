export type SpotifyPlaybackSnapshot = {
  paused: boolean;
  positionMs: number;
  durationMs: number;
  trackId: string;
  title: string;
  artist: string;
  artwork?: string;
};

type SpotifyPlayerState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window?: { current_track?: { id?: string; name?: string; artists?: { name?: string }[]; album?: { images?: { url?: string }[] } } };
};

type SpotifyPlayer = {
  addListener(event: string, callback: (payload: any) => void): boolean;
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  togglePlay(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  getCurrentState(): Promise<SpotifyPlayerState | null>;
};

declare global {
  interface Window {
    Spotify?: { Player: new (options: { name: string; volume?: number; getOAuthToken: (callback: (token: string) => void) => void; enableMediaSession?: boolean }) => SpotifyPlayer };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

const ACCESS_KEY = "lyne.spotify.accessToken";
const REFRESH_KEY = "lyne.spotify.refreshToken";
const EXPIRES_KEY = "lyne.spotify.expiresAt";
const VERIFIER_KEY = "lyne.spotify.codeVerifier";
const OAUTH_STATE_KEY = "lyne.spotify.oauthState";
const CLIENT_KEY = "lyne.spotify.clientId";
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

let player: SpotifyPlayer | null = null;
let deviceId = "";
let sdkPromise: Promise<void> | null = null;
let readyPromise: Promise<void> | null = null;
let onPlaybackSnapshot: ((snapshot: SpotifyPlaybackSnapshot | null) => void) | null = null;

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function makeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function spotifyHasSession(): boolean {
  return Boolean(localStorage.getItem(REFRESH_KEY) || localStorage.getItem(ACCESS_KEY));
}

export function spotifySavedClientId(): string {
  return localStorage.getItem(CLIENT_KEY) || "";
}

export function setSpotifyClientId(clientId: string): void {
  if (clientId.trim()) localStorage.setItem(CLIENT_KEY, clientId.trim());
}

export async function beginSpotifyAuthorization(clientId: string, redirectUri: string): Promise<void> {
  const normalizedId = clientId.trim();
  if (!normalizedId) throw new Error("Enter your Spotify app Client ID first.");
  if (!/^https:\/\//i.test(redirectUri)) throw new Error("Spotify sign-in requires the published HTTPS LYNE address.");
  localStorage.setItem(CLIENT_KEY, normalizedId);
  const verifier = randomString(96);
  const state = randomString(32);
  localStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(OAUTH_STATE_KEY, state);
  const challenge = await makeChallenge(verifier);
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: normalizedId,
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  }).toString();
  window.location.assign(url.toString());
}

export async function handleSpotifyAuthorizationRedirect(clientId: string, redirectUri: string): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");
  const error = params.get("error");
  if (!code && !error) return false;
  const expectedState = localStorage.getItem(OAUTH_STATE_KEY);
  const verifier = localStorage.getItem(VERIFIER_KEY);
  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  localStorage.removeItem(OAUTH_STATE_KEY);
  localStorage.removeItem(VERIFIER_KEY);
  if (error) throw new Error("Spotify authorization was not completed: " + error.replace(/_/g, " "));
  if (!code || !returnedState || !expectedState || returnedState !== expectedState || !verifier) {
    throw new Error("Spotify sign-in could not be verified. Please connect again.");
  }
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Spotify could not finish sign-in.");
  localStorage.setItem(ACCESS_KEY, result.access_token);
  if (result.refresh_token) localStorage.setItem(REFRESH_KEY, result.refresh_token);
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + Math.max(60, result.expires_in || 3600) * 1000));
  return true;
}

export async function getSpotifyAccessToken(clientId: string): Promise<string> {
  const access = localStorage.getItem(ACCESS_KEY);
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY) || 0);
  if (access && expiresAt > Date.now() + 90_000) return access;
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) throw new Error("Connect your Spotify account in Settings → Connections first.");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: clientId }),
  });
  const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    throw new Error(result.error_description || "Spotify sign-in expired. Connect Spotify again.");
  }
  localStorage.setItem(ACCESS_KEY, result.access_token);
  if (result.refresh_token) localStorage.setItem(REFRESH_KEY, result.refresh_token);
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + Math.max(60, result.expires_in || 3600) * 1000));
  return result.access_token;
}

async function loadSpotifySdk(): Promise<void> {
  if (window.Spotify?.Player) return;
  if (!sdkPromise) {
    sdkPromise = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Spotify's playback SDK did not load. Check your connection or content blocker.")), 15000);
      window.onSpotifyWebPlaybackSDKReady = () => { window.clearTimeout(timeout); resolve(); };
      const existing = document.querySelector<HTMLScriptElement>('script[data-lyne-spotify-sdk="true"]');
      if (existing) return;
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.dataset.lyneSpotifySdk = "true";
      script.onerror = () => { window.clearTimeout(timeout); reject(new Error("Spotify's playback SDK could not be downloaded.")); };
      document.head.appendChild(script);
    }).catch(error => { sdkPromise = null; throw error; });
  }
  await sdkPromise;
}

function snapshotFromState(state: SpotifyPlayerState | null): SpotifyPlaybackSnapshot | null {
  const track = state?.track_window?.current_track;
  if (!state || !track) return null;
  return {
    paused: state.paused,
    positionMs: Math.max(0, Number(state.position) || 0),
    durationMs: Math.max(0, Number(state.duration) || 0),
    trackId: track.id || "",
    title: track.name || "Spotify track",
    artist: (track.artists || []).map(item => item.name).filter(Boolean).join(", "),
    artwork: track.album?.images?.[0]?.url,
  };
}

export async function connectSpotifyPlayer(
  clientId: string,
  onState: (snapshot: SpotifyPlaybackSnapshot | null) => void,
): Promise<void> {
  await loadSpotifySdk();
  if (!window.Spotify?.Player) throw new Error("Spotify's playback SDK is unavailable in this browser.");
  onPlaybackSnapshot = onState;
  if (!player) {
    player = new window.Spotify.Player({
      name: "LYNE",
      volume: 0.8,
      enableMediaSession: true,
      getOAuthToken: callback => {
        void getSpotifyAccessToken(clientId).then(callback).catch(() => onState(null));
      },
    });
    readyPromise = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Spotify connected, but the LYNE playback device did not become ready. Open Spotify and try again.")), 20000);
      player!.addListener("ready", (payload: { device_id: string }) => {
        deviceId = payload.device_id;
        window.clearTimeout(timer);
        resolve();
      });
      player!.addListener("not_ready", () => { deviceId = ""; });
      player!.addListener("player_state_changed", (state: SpotifyPlayerState | null) => onPlaybackSnapshot?.(snapshotFromState(state)));
      player!.addListener("initialization_error", (payload: { message?: string }) => onState(null));
      player!.addListener("authentication_error", (payload: { message?: string }) => onState(null));
      player!.addListener("account_error", (payload: { message?: string }) => onState(null));
      player!.addListener("playback_error", (payload: { message?: string }) => onState(null));
    });
  }
  const connected = await player.connect();
  if (!connected) throw new Error("Spotify could not connect the LYNE playback device. Check Spotify Premium and try again.");
  if (!deviceId && readyPromise) await readyPromise;
}

export async function playSpotifyTrack(uri: string, clientId: string): Promise<void> {
  await playSpotifyTracks([uri], clientId);
}

export async function playSpotifyTracks(uris: string[], clientId: string): Promise<void> {
  if (!player || !deviceId) throw new Error("Spotify is not connected to LYNE yet. Open Settings → Connections and connect Spotify.");
  const validUris = uris.filter(uri => /^spotify:track:[A-Za-z0-9]+$/.test(uri)).slice(0, 100);
  if (!validUris.length) throw new Error("No valid Spotify tracks were provided.");
  // Must run immediately from the user's tap on iOS and other autoplay-restricted browsers.
  void player.activateElement().catch(() => {});
  const token = await getSpotifyAccessToken(clientId);
  const response = await fetch("https://api.spotify.com/v1/me/player/play?device_id=" + encodeURIComponent(deviceId), {
    method: "PUT",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: validUris }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || "Spotify could not start this track on LYNE.");
  }
}

export async function getSpotifyPlaybackSnapshot(): Promise<SpotifyPlaybackSnapshot | null> {
  if (!player) return null;
  return snapshotFromState(await player.getCurrentState());
}

export async function toggleSpotifyPlayback(): Promise<void> {
  if (!player) throw new Error("Spotify is not connected to LYNE.");
  await player.togglePlay();
}
export async function nextSpotifyTrack(): Promise<void> {
  if (!player) throw new Error("Spotify is not connected to LYNE.");
  await player.nextTrack();
}
export async function previousSpotifyTrack(): Promise<void> {
  if (!player) throw new Error("Spotify is not connected to LYNE.");
  await player.previousTrack();
}
export async function seekSpotifyPlayback(positionMs: number): Promise<void> {
  if (!player) throw new Error("Spotify is not connected to LYNE.");
  await player.seek(Math.max(0, positionMs));
}
export async function setSpotifyVolume(volume: number): Promise<void> {
  if (player) await player.setVolume(Math.max(0, Math.min(1, volume)));
}
export function disconnectSpotify(): void {
  player?.disconnect();
  player = null;
  deviceId = "";
  readyPromise = null;
  onPlaybackSnapshot = null;
  for (const key of [ACCESS_KEY, REFRESH_KEY, EXPIRES_KEY, OAUTH_STATE_KEY, VERIFIER_KEY]) localStorage.removeItem(key);
}
