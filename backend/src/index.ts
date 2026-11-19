import { resolveMusicLink, resolveSoundCloudPlayback, resolveYouTubePlayback, resolveYouTubeMatch, type ResolvedImport } from "./providers";

interface Env {
  SPOTIFY_CLIENT_ID?: string; SPOTIFY_CLIENT_SECRET?: string;
  SOUNDCLOUD_CLIENT_ID?: string; SOUNDCLOUD_CLIENT_SECRET?: string;
  YOUTUBE_API_KEY?: string; APPLE_MUSIC_DEVELOPER_TOKEN?: string;
  DB: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_BUCKET?: string;
  ADMIN_API_TOKEN: string;
  AUTH_SECRET: string;
  CORS_ORIGIN?: string;
}

type TrackRow = {
  id: string; title: string; artist: string; artistId: string; album?: string | null;
  albumId?: string | null; durationMs: number; explicit: number; genre?: string | null;
  artworkKey?: string | null; audioKey: string; audioMime: string; audioSize: number; lyrics?: string | null;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const AUDIO_TYPES = new Set(["audio/mpeg","audio/mp4","audio/aac","audio/wav","audio/x-wav","audio/flac","audio/ogg","audio/opus","audio/webm"]);
const IMAGE_TYPES = new Set(["image/jpeg","image/png","image/webp","image/avif"]);

function json(data: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}
function fail(message: string, status = 400) { return json({ error: message }, status); }
function id() { return crypto.randomUUID(); }
function normalized(value: string) { return value.trim().normalize("NFKC").toLocaleLowerCase("en"); }
function b64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function decodeB64url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
async function issueToken(userId: string, secret: string) {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ sub: userId, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+60*60*24*30 })));
  const unsigned = header + "." + payload;
  return unsigned + "." + b64url(await hmac(secret, unsigned));
}
async function tokenUser(request: Request, env: Env): Promise<string | null> {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || !env.AUTH_SECRET) return null;
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => !part)) return null;

    const header = JSON.parse(new TextDecoder().decode(decodeB64url(parts[0]))) as { alg?: string; typ?: string };
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;

    const expected = await hmac(env.AUTH_SECRET, parts[0] + "." + parts[1]);
    const actual = decodeB64url(parts[2]);
    if (expected.length !== actual.length) return null;
    let mismatch = 0;
    for (let index = 0; index < expected.length; index++) mismatch |= expected[index] ^ actual[index];
    if (mismatch !== 0) return null;

    const data = JSON.parse(new TextDecoder().decode(decodeB64url(parts[1]))) as { sub?: string; iat?: number; exp?: number };
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof data.sub !== "string" || !data.sub ||
      !Number.isInteger(data.iat) || !Number.isInteger(data.exp) ||
      (data.iat as number) > now + 60 ||
      (data.exp as number) <= now ||
      (data.exp as number) - (data.iat as number) > 60 * 60 * 24 * 30 + 60
    ) return null;
    return data.sub;
  } catch {
    // Malformed or tampered bearer tokens are authentication failures, not server errors.
    return null;
  }
}
async function passwordHash(password: string, salt?: Uint8Array) {
  const actualSalt = salt || crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: actualSalt, iterations: 210000, hash: "SHA-256" }, material, 256);
  return "pbkdf2$210000$" + b64url(actualSalt) + "$" + b64url(new Uint8Array(bits));
}
async function verifyPassword(password: string, stored: string) {
  const [kind, rounds, salt, expected] = stored.split("$");
  if (kind !== "pbkdf2" || !rounds || !salt || !expected) return false;
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: decodeB64url(salt), iterations: Number(rounds), hash: "SHA-256" }, material, 256);
  const actual = b64url(new Uint8Array(bits));
  return actual.length === expected.length && [...actual].every((c, i) => c === expected[i]);
}
function mediaUrl(key: string | null | undefined) {
  if (!key) return "";
  if (key.startsWith("data:image/")) return key;
  return "/v1/media/" + key.split("/").map(encodeURIComponent).join("/");
}
function storageReady(env: Env) {
  return !!env.SUPABASE_URL?.trim() && !!env.SUPABASE_SECRET_KEY?.trim();
}
function storageObjectUrl(env: Env, key: string, isPublic = false) {
  const base = env.SUPABASE_URL!.replace(/\/+$/, "");
  const bucket = encodeURIComponent(env.SUPABASE_BUCKET || "lyne-media");
  const object = key.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/${isPublic ? "public/" : ""}${bucket}/${object}`;
}
function storageHeaders(env: Env) {
  return { apikey: env.SUPABASE_SECRET_KEY! };
}
async function storageUpload(env: Env, key: string, file: File) {
  if (!storageReady(env)) throw new Error("Supabase media storage is not configured.");
  const response = await fetch(storageObjectUrl(env, key), {
    method: "POST",
    headers: { ...storageHeaders(env), "content-type": file.type, "x-upsert": "false" },
    body: await file.arrayBuffer(),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Supabase upload failed (${response.status})${message ? `: ${message.slice(0, 240)}` : ""}`);
  }
}
async function storageDelete(env: Env, key: string | null | undefined) {
  if (!key || key.startsWith("data:image/") || !storageReady(env)) return;
  const response = await fetch(storageObjectUrl(env, key), {
    method: "DELETE",
    headers: storageHeaders(env),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Supabase delete failed (${response.status}).`);
  }
}
function publicTrack(row: TrackRow) {
  return {
    id: row.id, title: row.title, artist: row.artist, artistId: row.artistId,
    album: row.album || undefined, albumId: row.albumId || undefined,
    durationMs: row.durationMs, explicit: !!row.explicit, genre: row.genre || undefined,
    audioMime: row.audioMime, audioSize: row.audioSize,
    artwork: mediaUrl(row.artworkKey), audioUrl: mediaUrl(row.audioKey), lyrics: row.lyrics || undefined,
  };
}
const TRACK_SELECT = `SELECT t.id, t.title, a.name AS artist, a.id AS artistId, al.title AS album,
  al.id AS albumId, t.duration_ms AS durationMs, t.explicit, t.genre, t.artwork_key AS artworkKey,
  t.audio_key AS audioKey, t.audio_mime AS audioMime, t.audio_size AS audioSize, t.lyrics
  FROM tracks t JOIN artists a ON a.id=t.artist_id LEFT JOIN albums al ON al.id=t.album_id`;

function cors(request: Request, env: Env) {
  const origin = request.headers.get("origin") || "";
  const allowed = env.CORS_ORIGIN || "*";
  const originAllowed = allowed === "*" || origin === allowed || allowed.split(",").map(x=>x.trim()).includes(origin);
  return {
    "access-control-allow-origin": originAllowed ? (allowed === "*" ? "*" : origin) : "null",
    "access-control-allow-methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "Authorization,Content-Type,Range,X-Admin-Token",
    "access-control-expose-headers": "Accept-Ranges,Content-Range,Content-Length,ETag",
    "vary": "Origin",
  };
}
function withCors(response: Response, request: Request, env: Env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function safeName(value: string) { return value.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu, "").trim().slice(0, 100) || "upload"; }
async function requireUser(request: Request, env: Env) {
  const userId = await tokenUser(request, env);
  if (!userId) throw new Response(JSON.stringify({ error: "Sign in is required." }), { status: 401, headers: JSON_HEADERS });
  return userId;
}
async function requireAdmin(request: Request, env: Env) {
  const provided = request.headers.get("x-admin-token") || "";
  if (!env.ADMIN_API_TOKEN || provided.length !== env.ADMIN_API_TOKEN.length) throw new Response(JSON.stringify({ error: "Admin access is not configured or authorized." }), { status: 401, headers: JSON_HEADERS });
  let diff = 0; for (let i=0;i<provided.length;i++) diff |= provided.charCodeAt(i) ^ env.ADMIN_API_TOKEN.charCodeAt(i);
  if (diff !== 0) throw new Response(JSON.stringify({ error: "Admin access is not configured or authorized." }), { status: 401, headers: JSON_HEADERS });
}

async function media(request: Request, env: Env, key: string) {
  if (!/^(audio|artwork|avatars|playlists)\/[a-zA-Z0-9._/-]+$/.test(key) || key.includes("..")) return fail("Media not found.", 404);
  if (!storageReady(env)) return fail("Media storage is not configured.", 503);
  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  const upstream = await fetch(storageObjectUrl(env, key, true), {
    method: request.method,
    headers,
  });
  if (!upstream.ok) return fail("Media not found.", upstream.status === 404 ? 404 : 502);
  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("cache-control", "public, max-age=3600");
  responseHeaders.set("x-content-type-options", "nosniff");
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env) });
  if (path === "/v1/health" && request.method === "GET") {
    let database = "unavailable";
    let schema = "unknown";
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      database = "connected";
      const usersTable = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first<{ name: string }>();
      schema = usersTable ? "ready" : "pending";
    } catch {
      // Keep the health response useful without exposing internal database errors.
    }
    const storage = storageReady(env) ? "configured" : "missing";
    const auth = env.AUTH_SECRET ? "configured" : "missing";
    const admin = env.ADMIN_API_TOKEN ? "configured" : "missing";
    const ok = database === "connected" && schema === "ready" && storage === "configured" && auth === "configured" && admin === "configured";
    return json({ ok, service: "LYNE API", database, schema, storage, auth, admin }, ok ? 200 : 503);
  }

  if(path==="/v1/providers/youtube/match"&&request.method==="GET"){
    try{
      const title=url.searchParams.get("title")||"";
      const artist=url.searchParams.get("artist")||"";
      return json(await resolveYouTubeMatch(title,artist));
    }catch(error){return fail(error instanceof Error?error.message:"No matching YouTube recording was found.",404);}
  }

  const youtubePlaybackMatch=path.match(/^\/v1\/providers\/youtube\/playback\/([a-zA-Z0-9_-]{11})$/);
  if(youtubePlaybackMatch&&request.method==="GET"){
    try{return json(await resolveYouTubePlayback(youtubePlaybackMatch[1]));}
    catch(error){return fail(error instanceof Error?error.message:"YouTube playback could not be resolved.",422);}
  }

  const soundCloudPlaybackMatch=path.match(/^\/v1\/providers\/soundcloud\/playback\/(\d+)$/);
  if(soundCloudPlaybackMatch&&request.method==="GET"){
    try{return json(await resolveSoundCloudPlayback(soundCloudPlaybackMatch[1],env));}
    catch(error){return fail(error instanceof Error?error.message:"SoundCloud playback could not be resolved.",422);}
  }

  if (path === "/v1/providers/status" && request.method === "GET") {
    return json({
      providers: {
        spotify: { configured: !!(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET), capability: "metadata" },
        soundcloud: { configured: true, capability: "public API metadata and eligible full-length streams" },
        youtube: { configured: !!env.YOUTUBE_API_KEY, capability: "metadata" },
        apple_music: { configured: !!env.APPLE_MUSIC_DEVELOPER_TOKEN, capability: "metadata" },
      },
      playback: { soundcloud: "official public API; full-length tracks only", youtube: "direct full-length audio where YouTube exposes a playable stream" },
    });
  }

  if (path.startsWith("/v1/media/") && ["GET","HEAD"].includes(request.method)) {
    const key = path.slice("/v1/media/".length).split("/").map(decodeURIComponent).join("/");
    return media(request, env, key);
  }

  if (path === "/v1/auth/register" && request.method === "POST") {
    const body = await request.json() as { username?: string; email?: string; password?: string };
    const username = body.username?.trim() || ""; const email = body.email?.trim().toLowerCase() || ""; const password = body.password || "";
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return fail("Username must be 3–24 letters, numbers or underscores.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
    if (password.length < 10 || password.length > 128) return fail("Password must be 10–128 characters.");
    const userId = id();
    const duplicate=await env.DB.prepare("SELECT username_norm,email FROM users WHERE username_norm=? OR email=?").bind(normalized(username),email).first<{username_norm:string;email:string}>();
    if(duplicate)return fail(duplicate.username_norm===normalized(username)?"That username is already taken.":"That email is already registered.",409);
    try {
      const hash=await passwordHash(password);
      await env.DB.prepare("INSERT INTO users (id,username,username_norm,email,password_hash) VALUES (?,?,?,?,?)").bind(userId,username,normalized(username),email,hash).run();
    } catch(error) {
      console.error("LYNE account registration failed",error);
      const detail=error instanceof Error?error.message:String(error);
      if(/unique|constraint/i.test(detail))return fail("That username or email is already registered.",409);
      const adminDebug=Boolean(env.ADMIN_API_TOKEN)&&request.headers.get("x-admin-token")===env.ADMIN_API_TOKEN;
      return fail(adminDebug?"Account registration diagnostic: "+detail.slice(0,240):"LYNE couldn't create your account right now. Please try again.",503);
    }
    return json({ accessToken: await issueToken(userId,env.AUTH_SECRET), user: { id: userId, username } },201);
  }

  if (path === "/v1/auth/login" && request.method === "POST") {
    const body = await request.json() as { username?: string; password?: string };
    const username = body.username?.trim() || ""; const password = body.password || "";
    const row = await env.DB.prepare("SELECT id,username,password_hash FROM users WHERE username_norm=? OR email=?").bind(normalized(username),username.toLowerCase()).first<{id:string;username:string;password_hash:string}>();
    if (!row) return fail("Incorrect username or password.",401);
    try { if(!(await verifyPassword(password,row.password_hash)))return fail("Incorrect username or password.",401); }
    catch(error){console.error("LYNE password verification failed",error);return fail("LYNE couldn't verify your password right now. Please try again.",503);}
    return json({ accessToken: await issueToken(row.id,env.AUTH_SECRET), user: { id: row.id, username: row.username } });
  }

  if (path === "/v1/me" && request.method === "GET") {
    const userId = await requireUser(request,env);
    const row = await env.DB.prepare("SELECT id,username,avatar_key AS avatarKey FROM users WHERE id=?").bind(userId).first<{id:string;username:string;avatarKey:string|null}>();
    if (!row) return fail("Account not found.",404);
    return json({ id:row.id, username:row.username, avatar:mediaUrl(row.avatarKey) });
  }
  
  if (path === "/v1/me/profile" && request.method === "PUT") {
    const userId = await requireUser(request,env);
    const body = await request.json() as { username?: string };
    const username = body.username?.trim() || "";
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return fail("Username must be 3–24 characters using letters, numbers, and underscores.");
    const usernameNorm = normalized(username);
    const duplicate = await env.DB.prepare("SELECT id FROM users WHERE username_norm=? AND id<>?").bind(usernameNorm,userId).first<{id:string}>();
    if (duplicate) return fail("That username is already in use.",409);
    const updated = await env.DB.prepare("UPDATE users SET username=?,username_norm=? WHERE id=?").bind(username,usernameNorm,userId).run();
    if (!updated.meta.changes) return fail("Account not found.",404);
    return json({ username });
  }



  if(path==="/v1/me/preferences" && request.method==="GET"){
    const userId=await requireUser(request,env);
    const row=await env.DB.prepare("SELECT preferences_json AS preferencesJson FROM users WHERE id=?").bind(userId).first<{preferencesJson:string|null}>();
    if(!row)return fail("Account not found.",404);
    let preferences:Record<string,unknown>={};
    try{const value=JSON.parse(row.preferencesJson||"{}");if(value&&typeof value==="object"&&!Array.isArray(value))preferences=value;}catch{}
    return json({preferences});
  }
  if(path==="/v1/me/preferences" && request.method==="PUT"){
    const userId=await requireUser(request,env);
    const body=await request.json() as {preferences?:unknown};
    if(!body.preferences||typeof body.preferences!=="object"||Array.isArray(body.preferences))return fail("Preferences must be an object.");
    const serialized=JSON.stringify(body.preferences);
    if(serialized.length>12000)return fail("Preferences are too large.");
    await env.DB.prepare("UPDATE users SET preferences_json=? WHERE id=?").bind(serialized,userId).run();
    return json({saved:true});
  }
  if(path==="/v1/me/avatar" && (request.method==="POST"||request.method==="DELETE")){
    const userId=await requireUser(request,env);
    const previous=await env.DB.prepare("SELECT avatar_key AS avatarKey FROM users WHERE id=?").bind(userId).first<{avatarKey:string|null}>();
    if(!previous)return fail("Account not found.",404);
    if(request.method==="DELETE"){
      await env.DB.prepare("UPDATE users SET avatar_key=NULL WHERE id=?").bind(userId).run();
      await storageDelete(env, previous.avatarKey);
      return json({avatar:""});
    }
    const form=await request.formData();
    const image=form.get("avatar");
    if(!(image instanceof File)||!IMAGE_TYPES.has(image.type)||image.size<1||image.size>5*1024*1024)return fail("Profile photo must be JPG, PNG, WebP or AVIF and no larger than 5 MB.");
    if(!storageReady(env))return fail("Media storage is not configured.",503);
    const extension=image.type.split("/")[1].replace("jpeg","jpg");
    const key="avatars/"+userId+"/"+id()+"."+extension;
    try{
      await storageUpload(env,key,image);
      await env.DB.prepare("UPDATE users SET avatar_key=? WHERE id=?").bind(key,userId).run();
      await storageDelete(env,previous.avatarKey);
      return json({avatar:mediaUrl(key)});
    }catch(error){
      await storageDelete(env,key).catch(()=>{});
      return fail(error instanceof Error?error.message:"Could not save profile photo.",500);
    }
  }

  if(path==="/v1/import/resolve" && request.method==="GET"){
    const raw=url.searchParams.get("url")||"";
    if(raw.length>2048)return fail("Music link is too long.");
    try{
      const resolved=await resolveMusicLink(raw,env);
      return json(resolved);
    }catch(error){
      return fail(error instanceof Error?error.message:"Unable to resolve that music link.",422);
    }
  }

  if(path==="/v1/me/imports" && request.method==="GET"){
    const userId=await requireUser(request,env);
    const [likes,collections]=await Promise.all([
      env.DB.prepare("SELECT id,provider,provider_item_id AS providerId,title,subtitle,external_url AS externalUrl,artwork_url AS artwork,embed_url AS embedUrl,metadata_json AS metadataJson,created_at AS createdAt FROM imported_likes WHERE user_id=? ORDER BY created_at DESC").bind(userId).all(),
      env.DB.prepare("SELECT id,provider,provider_item_id AS providerId,kind,title,subtitle,external_url AS externalUrl,artwork_url AS artwork,embed_url AS embedUrl,metadata_json AS metadataJson,created_at AS createdAt FROM imported_collections WHERE user_id=? ORDER BY created_at DESC").bind(userId).all()
    ]);
    const hydrate=(row:any)=>{let metadata={};try{metadata=JSON.parse(row.metadataJson||"{}");}catch{}return {...row,...metadata,createdAt:row.createdAt};};
    return json({likes:likes.results.map(hydrate),collections:collections.results.map(hydrate)});
  }

  if(path==="/v1/me/imports" && request.method==="POST"){
    const userId=await requireUser(request,env);
    const item=await request.json() as Partial<ResolvedImport>;
    const providers=["spotify","soundcloud","youtube","apple_music"];
    if(!item.provider||!providers.includes(item.provider)||!item.providerId||!item.title||!item.externalUrl||!["track","playlist","album"].includes(item.kind||""))return fail("Invalid imported music item.");
    let external:URL;try{external=new URL(item.externalUrl);}catch{return fail("Invalid source link.");}
    const hosts=["open.spotify.com","spotify.link","soundcloud.com","m.soundcloud.com","youtube.com","www.youtube.com","music.youtube.com","youtu.be","music.apple.com"];
    if(external.protocol!=="https:"||!hosts.includes(external.hostname.toLowerCase()))return fail("Unsupported music source URL.");
    const safePayload={provider:item.provider,kind:item.kind,providerId:item.providerId,title:item.title.slice(0,180),subtitle:(item.subtitle||"").slice(0,180),externalUrl:external.toString(),artwork:item.artwork||"",embedUrl:item.embedUrl||"",tracks:(item.tracks||[]).slice(0,100)};
    const itemId=id();const meta=JSON.stringify(safePayload);
    if(item.kind==="track"){
      const result=await env.DB.prepare("INSERT INTO imported_likes (id,user_id,provider,provider_item_id,title,subtitle,external_url,artwork_url,embed_url,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,provider,provider_item_id) DO UPDATE SET title=excluded.title,subtitle=excluded.subtitle,external_url=excluded.external_url,artwork_url=excluded.artwork_url,embed_url=excluded.embed_url,metadata_json=excluded.metadata_json RETURNING id").bind(itemId,userId,item.provider,item.providerId,safePayload.title,safePayload.subtitle,safePayload.externalUrl,safePayload.artwork,safePayload.embedUrl,meta).first<{id:string}>();
      return json({saved:true,kind:"track",id:result?.id||itemId},201);
    }
    const kind=item.kind as "playlist"|"album";
    const result=await env.DB.prepare("INSERT INTO imported_collections (id,user_id,provider,provider_item_id,kind,title,subtitle,external_url,artwork_url,embed_url,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,provider,provider_item_id,kind) DO UPDATE SET title=excluded.title,subtitle=excluded.subtitle,external_url=excluded.external_url,artwork_url=excluded.artwork_url,embed_url=excluded.embed_url,metadata_json=excluded.metadata_json RETURNING id").bind(itemId,userId,item.provider,item.providerId,kind,safePayload.title,safePayload.subtitle,safePayload.externalUrl,safePayload.artwork,safePayload.embedUrl,meta).first<{id:string}>();
    return json({saved:true,kind,id:result?.id||itemId},201);
  }

  if (path === "/v1/home" && request.method === "GET") {
    const userId = await tokenUser(request,env);
    const popular = await env.DB.prepare(TRACK_SELECT + " WHERE t.published=1 ORDER BY t.plays_count DESC,t.created_at DESC LIMIT 16").all<TrackRow>();
    const listeningSince = new Date(Date.now()-12*60*60*1000).toISOString();
    const listeningNow = await env.DB.prepare(TRACK_SELECT + " JOIN listening_events le ON le.track_id=t.id WHERE t.published=1 AND le.played_at>=? GROUP BY t.id ORDER BY SUM(le.listened_ms) DESC,MAX(le.played_at) DESC LIMIT 10").bind(listeningSince).all<TrackRow>();
    const recent = userId ? await env.DB.prepare(TRACK_SELECT + " JOIN listening_events le ON le.track_id=t.id WHERE t.published=1 AND le.user_id=? GROUP BY t.id ORDER BY MAX(le.played_at) DESC LIMIT 10").bind(userId).all<TrackRow>() : { results: [] as TrackRow[] };
    const personalized = userId ? await env.DB.prepare(TRACK_SELECT + " JOIN listening_events le ON le.track_id=t.id WHERE t.published=1 AND le.user_id=? GROUP BY t.id ORDER BY SUM(le.listened_ms) DESC LIMIT 12").bind(userId).all<TrackRow>() : { results: [] as TrackRow[] };
    const dailyTracks=(personalized.results.length?personalized.results:popular.results).map(publicTrack);
    const repeatTracks=personalized.results.map(publicTrack);
    const favoriteIds=new Set(personalized.results.map(track=>track.id));
    const discoveryTracks=popular.results.filter(track=>!favoriteIds.has(track.id)).map(publicTrack);
    const recentTracks=recent.results.map(publicTrack);
    const popularAlbums=await env.DB.prepare(`SELECT al.id,al.title,a.name AS artist,a.id AS artistId,
      al.release_date AS releaseDate,
      CASE WHEN al.artwork_key IS NULL THEN '' ELSE '/v1/media/' || al.artwork_key END AS artwork,
      (SELECT COUNT(*) FROM tracks t WHERE t.album_id=al.id AND t.published=1) AS trackCount
      FROM albums al JOIN artists a ON a.id=al.artist_id
      WHERE EXISTS (SELECT 1 FROM tracks t WHERE t.album_id=al.id AND t.published=1)
      ORDER BY (SELECT COALESCE(SUM(t.plays_count),0) FROM tracks t WHERE t.album_id=al.id AND t.published=1) DESC,
      al.created_at DESC LIMIT 12`).all();
    const mixes=[
      {id:"daily-mix",title:"Daily Mix",tracks:dailyTracks.slice(0,10)},
      ...(repeatTracks.length?[{id:"on-repeat",title:"On Repeat",tracks:repeatTracks.slice(0,10)}]:[]),
      {id:"discovery",title:"Discovery Mix",tracks:(discoveryTracks.length?discoveryTracks:dailyTracks).slice(0,10)},
      ...(recentTracks.length?[{id:"recently-played",title:"Your Recent Mix",tracks:recentTracks.slice(0,10)}]:[])
    ].filter(mix=>mix.tracks.length>0).map(mix=>({...mix,artwork:mix.tracks[0]?.artwork||""}));
    return json({ recentlyPlayed: recentTracks, popular: popular.results.map(publicTrack), listeningNow:listeningNow.results.map(publicTrack), popularAlbums:popularAlbums.results, mixes });
  }

  if (path === "/v1/tracks" && request.method === "GET") {
    const limit = Math.min(100,Math.max(1,Number(url.searchParams.get("limit")||30)));
    const offset = Math.max(0,Number(url.searchParams.get("offset")||0));
    const result = await env.DB.prepare(TRACK_SELECT + " WHERE t.published=1 ORDER BY t.created_at DESC LIMIT ? OFFSET ?").bind(limit,offset).all<TrackRow>();
    return json({ tracks: result.results.map(publicTrack), total: result.results.length });
  }

  if (path === "/v1/artists" && request.method === "GET") {
    const q = (url.searchParams.get("q")||"").trim(); const like = "%" + q.replace(/[%_]/g,"") + "%";
    const result = await env.DB.prepare(`SELECT a.id,a.name,a.bio, ${"CASE WHEN a.image_key IS NULL THEN '' ELSE '/v1/media/' || a.image_key END"} AS artwork,
      (SELECT COUNT(*) FROM tracks t WHERE t.artist_id=a.id AND t.published=1) AS trackCount
      FROM artists a WHERE (?='' OR a.name LIKE ?) ORDER BY a.name COLLATE NOCASE LIMIT 100`).bind(q,like).all();
    return json({ artists: result.results });
  }

  if (path === "/v1/albums" && request.method === "GET") {
    const q=(url.searchParams.get("q")||"").trim(); const result=await env.DB.prepare(`SELECT al.id,al.title,a.name AS artist,a.id AS artistId,al.release_date AS releaseDate,
      CASE WHEN al.artwork_key IS NULL THEN '' ELSE '/v1/media/' || al.artwork_key END AS artwork,
      (SELECT COUNT(*) FROM tracks t WHERE t.album_id=al.id AND t.published=1) AS trackCount
      FROM albums al JOIN artists a ON a.id=al.artist_id WHERE (?='' OR al.title LIKE ?) ORDER BY al.title COLLATE NOCASE LIMIT 100`).bind(q,"%"+q.replace(/[%_]/g,"")+"%").all();
    return json({ albums: result.results });
  }

  if (path === "/v1/search" && request.method === "GET") {
    const q=(url.searchParams.get("q")||"").trim(); const type=url.searchParams.get("type")||"all";
    if (q.length<2) return json({ tracks:[],artists:[],albums:[],playlists:[] });
    const like="%"+q.replace(/[%_]/g,"")+"%";
    const tracks = type==="all"||type==="tracks" ? await env.DB.prepare(TRACK_SELECT+" WHERE t.published=1 AND (t.title LIKE ? OR a.name LIKE ? OR al.title LIKE ?) ORDER BY t.plays_count DESC LIMIT 30").bind(like,like,like).all<TrackRow>() : {results:[] as TrackRow[]};
    const artists = type==="all"||type==="artists" ? await env.DB.prepare("SELECT id,name,bio,CASE WHEN image_key IS NULL THEN '' ELSE '/v1/media/' || image_key END AS artwork FROM artists WHERE name LIKE ? ORDER BY name COLLATE NOCASE LIMIT 20").bind(like).all() : {results:[]};
    const albums = type==="all"||type==="albums" ? await env.DB.prepare("SELECT al.id,al.title,a.name AS artist,a.id AS artistId,CASE WHEN al.artwork_key IS NULL THEN '' ELSE '/v1/media/' || al.artwork_key END AS artwork FROM albums al JOIN artists a ON a.id=al.artist_id WHERE al.title LIKE ? OR a.name LIKE ? ORDER BY al.title LIMIT 20").bind(like,like).all() : {results:[]};
    const playlists = type==="all"||type==="playlists" ? await env.DB.prepare("SELECT p.id,p.name,p.description,u.username AS owner,CASE WHEN p.cover_key IS NULL THEN '' ELSE '/v1/media/' || p.cover_key END AS cover FROM playlists p JOIN users u ON u.id=p.user_id WHERE p.name LIKE ? ORDER BY p.updated_at DESC LIMIT 20").bind(like).all() : {results:[]};
    return json({ tracks:tracks.results.map(publicTrack), artists:artists.results, albums:albums.results, playlists:playlists.results });
  }

  const artistMatch = path.match(/^\/v1\/artists\/([a-f0-9-]+)$/i);
  if (artistMatch && request.method==="GET") {
    const artist=await env.DB.prepare("SELECT id,name,bio,CASE WHEN image_key IS NULL THEN '' ELSE '/v1/media/' || image_key END AS artwork FROM artists WHERE id=?").bind(artistMatch[1]).first();
    if(!artist)return fail("Artist not found.",404);
    const tracks=await env.DB.prepare(TRACK_SELECT+" WHERE t.published=1 AND t.artist_id=? ORDER BY t.created_at DESC LIMIT 100").bind(artistMatch[1]).all<TrackRow>();
    const albums=await env.DB.prepare("SELECT id,title,release_date AS releaseDate,CASE WHEN artwork_key IS NULL THEN '' ELSE '/v1/media/' || artwork_key END AS artwork FROM albums WHERE artist_id=? ORDER BY release_date DESC").bind(artistMatch[1]).all();
    return json({artist,tracks:tracks.results.map(publicTrack),albums:albums.results});
  }

  const albumMatch=path.match(/^\/v1\/albums\/([a-f0-9-]+)$/i);
  if(albumMatch && request.method==="GET"){
    const album=await env.DB.prepare("SELECT al.id,al.title,al.release_date AS releaseDate,a.id AS artistId,a.name AS artist,CASE WHEN al.artwork_key IS NULL THEN '' ELSE '/v1/media/' || al.artwork_key END AS artwork FROM albums al JOIN artists a ON a.id=al.artist_id WHERE al.id=?").bind(albumMatch[1]).first();
    if(!album)return fail("Album not found.",404);
    const tracks=await env.DB.prepare(TRACK_SELECT+" WHERE t.published=1 AND t.album_id=? ORDER BY t.created_at").bind(albumMatch[1]).all<TrackRow>();
    return json({album,tracks:tracks.results.map(publicTrack)});
  }

  if(path==="/v1/me/playlists" && request.method==="GET"){
  const publicPlaylistMatch=path.match(/^\/v1\/playlists\/([a-f0-9-]+)$/i);
  if(publicPlaylistMatch && request.method==="GET"){
    const playlist=await env.DB.prepare("SELECT p.id,p.name,p.description,p.cover_key AS coverKey,u.username AS owner FROM playlists p JOIN users u ON u.id=p.user_id WHERE p.id=?").bind(publicPlaylistMatch[1]).first<{id:string;name:string;description:string|null;coverKey:string|null;owner:string}>();
    if(!playlist)return fail("Playlist not found.",404);
    const items=await env.DB.prepare("SELECT track_id AS id FROM playlist_tracks WHERE playlist_id=? ORDER BY position ASC,added_at ASC").bind(publicPlaylistMatch[1]).all<{id:string}>();
    const ids=items.results.map(item=>item.id);
    const found=ids.length?await env.DB.prepare(TRACK_SELECT+` WHERE t.published=1 AND t.id IN (${ids.map(()=>"?").join(",")})`).bind(...ids).all<TrackRow>():{results:[] as TrackRow[]};
    const byId=new Map(found.results.map(track=>[track.id,publicTrack(track)]));
    return json({playlist:{id:playlist.id,name:playlist.name,description:playlist.description||"",owner:playlist.owner,cover:mediaUrl(playlist.coverKey),trackIds:ids},tracks:ids.map(id=>byId.get(id)).filter(Boolean)});
  }


    const userId=await requireUser(request,env);
    const playlists=await env.DB.prepare("SELECT id,name,description,cover_key AS coverKey,updated_at AS updatedAt FROM playlists WHERE user_id=? ORDER BY updated_at DESC").bind(userId).all();
    const hydrated=await Promise.all(playlists.results.map(async (p:any)=>{
      const items=await env.DB.prepare("SELECT track_id AS id FROM playlist_tracks WHERE playlist_id=? ORDER BY position ASC,added_at ASC").bind(p.id).all<{id:string}>();
      return {...p,cover:mediaUrl(p.coverKey),trackIds:items.results.map(item=>item.id),updatedAt:Date.parse(p.updatedAt)||Date.now()};
    }));
    return json({playlists:hydrated});
  }

  if(path==="/v1/me/playlists" && request.method==="POST"){
    const userId=await requireUser(request,env); const body=await request.json() as {id?:string;name?:string;description?:string};
    const name=body.name?.trim()||""; if(!name||name.length>80)return fail("Playlist name must be 1–80 characters.");
    const playlistId=id(); await env.DB.prepare("INSERT INTO playlists (id,user_id,name,description) VALUES (?,?,?,?)").bind(playlistId,userId,name,body.description?.slice(0,500)||null).run();
    return json({id:playlistId,name,description:body.description||"",cover:"",trackIds:[],updatedAt:Date.now()},201);
  }

  const playlistCoverMatch=path.match(/^\/v1\/me\/playlists\/([a-f0-9-]+)\/cover$/i);
  if(playlistCoverMatch && (request.method==="POST"||request.method==="DELETE")){
    const userId=await requireUser(request,env);
    const playlistId=playlistCoverMatch[1];
    const playlist=await env.DB.prepare("SELECT cover_key AS coverKey FROM playlists WHERE id=? AND user_id=?").bind(playlistId,userId).first<{coverKey:string|null}>();
    if(!playlist)return fail("Playlist not found.",404);
    if(request.method==="DELETE"){
      await env.DB.prepare("UPDATE playlists SET cover_key=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(playlistId,userId).run();
      await storageDelete(env,playlist.coverKey);
      return json({cover:""});
    }
    const form=await request.formData();
    const image=form.get("artwork");
    if(!(image instanceof File)||!IMAGE_TYPES.has(image.type)||image.size<1||image.size>7*1024*1024)return fail("Playlist artwork must be JPG, PNG, WebP or AVIF and no larger than 7 MB.");
    if(!storageReady(env))return fail("Media storage is not configured.",503);
    const extension=image.type.split("/")[1].replace("jpeg","jpg");
    const key="playlists/"+playlistId+"/"+id()+"."+extension;
    await storageUpload(env,key,image);
    await env.DB.prepare("UPDATE playlists SET cover_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(key,playlistId,userId).run();
    await storageDelete(env,playlist.coverKey);
    return json({cover:mediaUrl(key)});
  }

  const playlistMatch=path.match(/^\/v1\/me\/playlists\/([a-f0-9-]+)$/i);
  if(playlistMatch && request.method==="PUT"){
    const userId=await requireUser(request,env); const playlistId=playlistMatch[1];
    const body=await request.json() as {name?:string;description?:string;trackIds?:string[]};
    const name=body.name?.trim()||"";
    if(!name||name.length>80)return fail("Playlist name must be 1–80 characters.");
    if(body.trackIds!==undefined && (!Array.isArray(body.trackIds)||body.trackIds.length>90))return fail("Playlist can contain up to 90 synced catalogue tracks.");
    const owned=await env.DB.prepare("SELECT id FROM playlists WHERE id=? AND user_id=?").bind(playlistId,userId).first();
    if(!owned)return fail("Playlist not found.",404);
    const trackIds=[...new Set((body.trackIds||[]).filter((value):value is string=>typeof value==="string" && value.length<=80))];
    const validIds:string[]=[];
    if(trackIds.length){
      const placeholders=trackIds.map(()=>"?").join(",");
      const valid=await env.DB.prepare("SELECT id FROM tracks WHERE published=1 AND id IN ("+placeholders+")").bind(...trackIds).all<{id:string}>();
      const validSet=new Set(valid.results.map(item=>item.id));
      trackIds.forEach(value=>{if(validSet.has(value))validIds.push(value);});
    }
    const batch=[
      env.DB.prepare("UPDATE playlists SET name=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(name,(body.description||"").slice(0,500)||null,playlistId,userId),
      env.DB.prepare("DELETE FROM playlist_tracks WHERE playlist_id=?").bind(playlistId),
      ...validIds.map((trackId,index)=>env.DB.prepare("INSERT INTO playlist_tracks (playlist_id,track_id,position) VALUES (?,?,?)").bind(playlistId,trackId,index))
    ];
    await env.DB.batch(batch);
    return json({id:playlistId,name,description:body.description||"",cover:"",trackIds:validIds,updatedAt:Date.now()});
  }
  if(playlistMatch && request.method==="DELETE"){
    const userId=await requireUser(request,env);
    const result=await env.DB.prepare("DELETE FROM playlists WHERE id=? AND user_id=?").bind(playlistMatch[1],userId).run();
    if(!result.meta.changes)return fail("Playlist not found.",404);
    return new Response(null,{status:204});
  }

  if(path==="/v1/me/listening" && request.method==="GET"){
    const userId=await requireUser(request,env);
    const history=await env.DB.prepare(`SELECT le.track_id AS id,t.title,a.name AS artist,SUM(le.listened_ms) AS ms,substr(le.played_at,1,10) AS day
      FROM listening_events le JOIN tracks t ON t.id=le.track_id JOIN artists a ON a.id=t.artist_id
      WHERE le.user_id=? GROUP BY le.track_id,substr(le.played_at,1,10) ORDER BY day DESC,ms DESC LIMIT 5000`).bind(userId).all<{id:string;title:string;artist:string;ms:number;day:string}>();
    return json({stats:history.results.map(item=>({...item,ms:Number(item.ms)||0}))});
  }

  if(path==="/v1/me/listening" && request.method==="POST"){
    const userId=await requireUser(request,env); const body=await request.json() as {trackId?:string;listenedMs?:number;playedAt?:string};
    const ms=Math.max(0,Math.min(60*60*1000,Math.floor(body.listenedMs||0)));
    if(!body.trackId||ms<1000)return fail("Invalid listening event.");
    const track=await env.DB.prepare("SELECT id FROM tracks WHERE id=? AND published=1").bind(body.trackId).first();
    if(!track)return fail("Track not found.",404);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO listening_events (id,user_id,track_id,listened_ms,played_at) VALUES (?,?,?,?,?)").bind(id(),userId,body.trackId,ms,body.playedAt||new Date().toISOString()),
      env.DB.prepare("UPDATE tracks SET plays_count=plays_count+1 WHERE id=?").bind(body.trackId)
    ]);
    return new Response(null,{status:204});
  }

  if(path==="/v1/admin/tracks" && request.method==="POST"){
    await requireAdmin(request,env);
    if(!storageReady(env))return fail("Media storage is not configured.",503);
    const form=await request.formData();
    const title=String(form.get("title")||"").trim(); const artistName=String(form.get("artist")||"").trim();
    const albumTitle=String(form.get("album")||"").trim(); const lyrics=String(form.get("lyrics")||"").trim().slice(0,50000); const rights=String(form.get("rightsStatus")||"");
    const rightsReference=String(form.get("rightsReference")||"").trim();
    const rightsConfirmed=String(form.get("rightsConfirmed")||"")==="true";
    const audio=form.get("audio"); const image=form.get("artwork");
    if(!title||title.length>180||!artistName||artistName.length>140)return fail("Track title and artist are required.");
    if(!(audio instanceof File)||audio.size<1||audio.size>45*1024*1024)return fail("Audio file is required and must be 45 MB or smaller.");
    if(!AUDIO_TYPES.has(audio.type))return fail("Unsupported audio format. Use MP3, AAC, M4A, WAV, FLAC, OGG, OPUS or WebM.");
    if(image && (!(image instanceof File)||!IMAGE_TYPES.has(image.type)||image.size>7*1024*1024))return fail("Artwork must be JPG, PNG, WebP or AVIF and no larger than 7 MB.");
    if(!rightsConfirmed||!["owned","licensed","public_domain"].includes(rights)||!rightsReference)return fail("Confirm your rights to distribute this recording and provide a rights reference.");
    const trackId=id(); const audioExtension=safeName(audio.name).split(".").pop()!.toLowerCase();
    const audioKey="audio/"+trackId+"."+audioExtension;
    const imageKey=image instanceof File?"artwork/"+trackId+"."+image.type.split("/")[1].replace("jpeg","jpg"):null;
    let artistId=""; let albumId:string|null=null;
    try{
      const artistRow=await env.DB.prepare("INSERT INTO artists (id,name,name_norm) VALUES (?,?,?) ON CONFLICT(name_norm) DO UPDATE SET name=excluded.name RETURNING id").bind(id(),artistName,normalized(artistName)).first<{id:string}>();
      if(!artistRow)throw new Error("Artist creation failed."); artistId=artistRow.id;
      if(albumTitle){
        const found=await env.DB.prepare("SELECT id FROM albums WHERE title=? AND artist_id=? LIMIT 1").bind(albumTitle,artistId).first<{id:string}>();
        albumId=found?.id||id();
        if(!found)await env.DB.prepare("INSERT INTO albums (id,title,artist_id) VALUES (?,?,?)").bind(albumId,albumTitle,artistId).run();
      }
      await storageUpload(env,audioKey,audio);
      if(image instanceof File)await storageUpload(env,imageKey!,image);
      await env.DB.prepare("INSERT INTO tracks (id,title,artist_id,album_id,duration_ms,genre,explicit,audio_key,audio_mime,audio_size,artwork_key,rights_status,rights_reference,lyrics,published) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)")
        .bind(trackId,title,artistId,albumId,Math.max(0,Number(form.get("durationMs")||0)),String(form.get("genre")||"").slice(0,80)||null,String(form.get("explicit")||"")==="true"?1:0,audioKey,audio.type,audio.size,imageKey,rights,rightsReference.slice(0,500),lyrics||null).run();
    }catch(error){
      await Promise.all([storageDelete(env,audioKey),storageDelete(env,imageKey)].map(p=>p.catch(()=>{})));
      return fail(error instanceof Error?error.message:"Unable to save track.",500);
    }
    return json({id:trackId,title,artist:artistName,album:albumTitle||undefined,durationMs:Number(form.get("durationMs")||0),artwork:mediaUrl(imageKey),audioUrl:mediaUrl(audioKey),published:true},201);
  }

  return fail("Route not found.",404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const response=await handle(request,env);
      return withCors(response,request,env);
    } catch(error) {
      if(error instanceof Response)return withCors(error,request,env);
      console.error("LYNE API request failed",error);
      return withCors(fail("Internal server error.",500),request,env);
    }
  }
};
