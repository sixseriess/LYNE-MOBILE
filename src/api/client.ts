export type Track = {
  id: string; title: string; artist: string; album?: string; artwork?: string;
  audioUrl?: string; durationMs?: number; explicit?: boolean; source?: "catalog" | "local";
  lyrics?: string;
};
export type Playlist = { id: string; name: string; description?: string; cover?: string; trackIds: string[]; updatedAt: number };
export type SearchKind = "all" | "tracks" | "artists" | "albums" | "playlists";

const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
function hydrateMedia<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => hydrateMedia(item)) as T;
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, child] of Object.entries(output)) {
      if (typeof child === "string" && child.startsWith("/") && ["audioUrl","artwork","avatar","cover"].includes(key)) {
        output[key] = API_URL + child;
      } else if (child && typeof child === "object") {
        output[key] = hydrateMedia(child);
      }
    }
    return output as T;
  }
  return value;
}
export class ApiError extends Error { constructor(message: string, public status = 0) { super(message); this.name = "ApiError"; } }

/** First-party LYNE API client. No third-party music API or legacy API fallback is used. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new ApiError("LYNE's API has not been deployed or configured yet.");
  if (!path.startsWith("/") || path.startsWith("//")) throw new ApiError("Invalid LYNE API path.");
  const token = localStorage.getItem("lyne.accessToken");
  let response: Response;
  try {
    response = await fetch(API_URL + path, {
      ...init, credentials: "omit",
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
  } catch { throw new ApiError("Can't reach the LYNE API. Check your connection."); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
    throw new ApiError(body.message || body.error || `LYNE API error (${response.status})`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json().then((data: unknown) => hydrateMedia(data as T));
}
export const lyneApi = {
  health: () => api<{ ok: boolean; service: string }>("/v1/health"),
  home: () => api<{ recentlyPlayed: Track[]; popular: Track[]; mixes: { id: string; title: string; artwork?: string }[] }>("/v1/home"),
  search: (q: string, type: SearchKind = "all") => api<{ tracks: Track[]; artists: unknown[]; albums: unknown[]; playlists: Playlist[] }>(`/v1/search?q=${encodeURIComponent(q)}&type=${type}`),
  me: () => api<{ id: string; username: string; avatar?: string }>("/v1/me"),
  login: (username: string, password: string) => api<{ accessToken: string; user: { id: string; username: string } }>("/v1/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username: string, email: string, password: string) => api<{ accessToken: string; user: { id: string; username: string } }>("/v1/auth/register", { method: "POST", body: JSON.stringify({ username, email, password }) }),
  playlists: () => api<{ playlists: Playlist[] }>("/v1/me/playlists"),
  savePlaylist: (playlist: Playlist) => api<Playlist>("/v1/me/playlists", { method: "POST", body: JSON.stringify(playlist) }),
  listening: (event: { trackId: string; listenedMs: number; playedAt: string }) => api<void>("/v1/me/listening", { method: "POST", body: JSON.stringify(event) }),
};