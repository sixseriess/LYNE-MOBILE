type AppleMusicPlayer = {
  isPlaying?: boolean;
  currentPlaybackTime?: number;
  currentPlaybackDuration?: number;
  volume?: number;
  playbackRate?: number;
  seekToTime?: (seconds: number) => Promise<void>;
  skipToNextItem?: () => Promise<void>;
  skipToPreviousItem?: () => Promise<void>;
  pause?: () => Promise<void>;
  play?: () => Promise<void>;
};

type AppleMusicInstance = {
  authorize(): Promise<string>;
  unauthorize(): Promise<void>;
  setQueue(descriptor: { url: string }): Promise<unknown>;
  play(): Promise<void>;
  pause(): Promise<void>;
  player: AppleMusicPlayer;
  addEventListener?: (event: string, callback: (event: unknown) => void) => void;
};

declare global {
  interface Window {
    MusicKit?: {
      configure(options: { developerToken: string; app: { name: string; build: string }; declarativeMarkup?: boolean; features?: string[] }): Promise<unknown> | unknown;
      getInstance(): AppleMusicInstance;
    };
  }
}

let instance: AppleMusicInstance | null = null;
let developerToken = "";
let sdkPromise: Promise<void> | null = null;

async function loadMusicKit(): Promise<void> {
  if (window.MusicKit?.getInstance) return;
  if (!sdkPromise) {
    sdkPromise = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Apple MusicKit did not load. Check your connection or content blocker.")), 15000);
      const existing = document.querySelector<HTMLScriptElement>('script[data-lyne-musickit="true"]');
      const script = existing || document.createElement("script");
      const ready = () => { window.clearTimeout(timeout); resolve(); };
      const check = () => {
        if (window.MusicKit?.getInstance) ready();
      };
      script.addEventListener("load", check, { once: true });
      script.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("Apple MusicKit could not be downloaded.")); }, { once: true });
      if (!existing) {
        script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
        script.async = true;
        script.dataset.lyneMusickit = "true";
        document.head.appendChild(script);
      }
      const poll = window.setInterval(() => {
        if (window.MusicKit?.getInstance) {
          window.clearInterval(poll);
          ready();
        }
      }, 100);
      window.setTimeout(() => window.clearInterval(poll), 15000);
    }).catch(error => { sdkPromise = null; throw error; });
  }
  await sdkPromise;
}

export async function initializeAppleMusic(token: string): Promise<void> {
  const value = token.trim();
  if (!value) throw new Error("Apple Music is not configured on the LYNE server. Add APPLE_MUSIC_DEVELOPER_TOKEN to the Worker secrets.");
  await loadMusicKit();
  if (!window.MusicKit) throw new Error("Apple MusicKit is unavailable in this browser.");
  if (instance && developerToken === value) return;
  developerToken = value;
  await window.MusicKit.configure({
    developerToken: value,
    app: { name: "LYNE", build: "0.1.0" },
    declarativeMarkup: false,
    features: ["player-accurate-timing", "api-data-store", "api-session-storage"],
  });
  instance = window.MusicKit.getInstance();
}

export async function authorizeAppleMusic(token?: string): Promise<void> {
  if (token) await initializeAppleMusic(token);
  if (!instance) throw new Error("Apple Music has not finished initializing. Check the developer token in Settings → Connections.");
  await instance.authorize();
}

export async function playAppleMusicSong(url: string): Promise<void> {
  if (!instance) throw new Error("Connect Apple Music in Settings → Connections first.");
  if (!url.startsWith("https://music.apple.com/")) throw new Error("This Apple Music item does not have a supported song link.");
  await instance.setQueue({ url });
  await instance.play();
}

export async function toggleAppleMusicPlayback(): Promise<void> {
  if (!instance) throw new Error("Apple Music is not connected to LYNE.");
  if (instance.player.isPlaying) await instance.pause();
  else await instance.play();
}

export async function nextAppleMusicTrack(): Promise<void> {
  if (!instance?.player.skipToNextItem) throw new Error("Apple Music next-track control is not available.");
  await instance.player.skipToNextItem();
}

export async function previousAppleMusicTrack(): Promise<void> {
  if (!instance?.player.skipToPreviousItem) throw new Error("Apple Music previous-track control is not available.");
  await instance.player.skipToPreviousItem();
}

export async function seekAppleMusicPlayback(positionMs: number): Promise<void> {
  if (!instance?.player.seekToTime) throw new Error("Apple Music seeking is not available in this browser.");
  await instance.player.seekToTime(Math.max(0, positionMs) / 1000);
}

export async function setAppleMusicVolume(volume: number): Promise<void> {
  if (instance) instance.player.volume = Math.max(0, Math.min(1, volume));
}

export function getAppleMusicPlaybackState(): { isPlaying: boolean; positionMs: number; durationMs: number } | null {
  if (!instance) return null;
  return {
    isPlaying: Boolean(instance.player.isPlaying),
    positionMs: Math.max(0, Number(instance.player.currentPlaybackTime) || 0) * 1000,
    durationMs: Math.max(0, Number(instance.player.currentPlaybackDuration) || 0) * 1000,
  };
}

export async function disconnectAppleMusic(): Promise<void> {
  if (instance) await instance.unauthorize().catch(() => {});
  instance = null;
  developerToken = "";
}
