interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ADMIN_API_TOKEN: string;
  AUTH_SECRET: string;
  CORS_ORIGIN?: string;
}

type TrackRow = {
  id: string; title: string; artist: string; artistId: string; album?: string | null;
  albumId?: string | null; durationMs: number; explicit: number; genre?: string | null;
  artworkKey?: string | null; audioKey: string; audioMime: string; audioSize: number;
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
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !env.AUTH_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = await hmac(env.AUTH_SECRET, parts[0] + "." + parts[1]);
  const actual = decodeB64url(parts[2]);
  if (expected.length !== actual.length || expected.some((v, i) => v !== actual[i])) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(decodeB64url(parts[1]))) as { sub?: string; exp?: number };
    if (!data.sub || !data.exp || data.exp < Date.now()/1000) return null;
    return data.sub;
  } catch { return null; }
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
function mediaUrl(key: string | null | undefined) { return key ? "/v1/media/" + key.split("/").map(encodeURIComponent).join("/") : ""; }
function publicTrack(row: TrackRow) {
  return {
    id: row.id, title: row.title, artist: row.artist, artistId: row.artistId,
    album: row.album || undefined, albumId: row.albumId || undefined,
    durationMs: row.durationMs, explicit: !!row.explicit, genre: row.genre || undefined,
    artwork: mediaUrl(row.artworkKey), audioUrl: mediaUrl(row.audioKey),
  };
}
const TRACK_SELECT = `SELECT t.id, t.title, a.name AS artist, a.id AS artistId, al.title AS album,
  al.id AS albumId, t.duration_ms AS durationMs, t.explicit, t.genre, t.artwork_key AS artworkKey,
  t.audio_key AS audioKey, t.audio_mime AS audioMime, t.audio_size AS audioSize
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
  if (!/^(audio|artwork|avatars|playlists)\/[a-zA-Z0-9._/-]+$/.test(key) || key.includes("..")) return fail("Media not found.",404);
  const object = await env.MEDIA.get(key, { range: request.headers });
  if (!object || !("body" in object) || !object.body) return fail("Media not found.",404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  if (object.range) {
    const start = object.range.offset ?? 0;
    const length = object.range.length ?? object.size;
    headers.set("content-range", `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(request.method === "HEAD" ? null : object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env) });
  if (path === "/v1/health" && request.method === "GET") return json({ ok: true, service: "LYNE API", storage: "Cloudflare R2", database: "Cloudflare D1" });

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
    try {
      await env.DB.prepare("INSERT INTO users (id,username,username_norm,email,password_hash) VALUES (?,?,?,?,?)").bind(userId,username,normalized(username),email,await passwordHash(password)).run();
    } catch { return fail("That username or email is already registered.",409); }
    return json({ accessToken: await issueToken(userId,env.AUTH_SECRET), user: { id: userId, username } },201);
  }

  if (path === "/v1/auth/login" && request.method === "POST") {
    const body = await request.json() as { username?: string; password?: string };
    const username = body.username?.trim() || ""; const password = body.password || "";
    const row = await env.DB.prepare("SELECT id,username,password_hash FROM users WHERE username_norm=? OR email=?").bind(normalized(username),username.toLowerCase()).first<{id:string;username:string;password_hash:string}>();
    if (!row || !(await verifyPassword(password,row.password_hash))) return fail("Incorrect username or password.",401);
    return json({ accessToken: await issueToken(row.id,env.AUTH_SECRET), user: { id: row.id, username: row.username } });
  }

  if (path === "/v1/me" && request.method === "GET") {
    const userId = await requireUser(request,env);
    const row = await env.DB.prepare("SELECT id,username,avatar_key AS avatarKey FROM users WHERE id=?").bind(userId).first<{id:string;username:string;avatarKey:string|null}>();
    if (!row) return fail("Account not found.",404);
    return json({ id:row.id, username:row.username, avatar:mediaUrl(row.avatarKey) });
  }

  if (path === "/v1/home" && request.method === "GET") {
    const userId = await tokenUser(request,env);
    const popular = await env.DB.prepare(TRACK_SELECT + " WHERE t.published=1 ORDER BY t.plays_count DESC,t.created_at DESC LIMIT 16").all<TrackRow>();
    const recent = userId ? await env.DB.prepare(TRACK_SELECT + " JOIN listening_events le ON le.track_id=t.id WHERE t.published=1 AND le.user_id=? GROUP BY t.id ORDER BY MAX(le.played_at) DESC LIMIT 10").bind(userId).all<TrackRow>() : { results: [] as TrackRow[] };
    return json({ recentlyPlayed: recent.results.map(publicTrack), popular: popular.results.map(publicTrack), mixes: [] });
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
    const artists = type==="all"||type==="artists" ? await env.DB.prepare("SELECT id,name,bio FROM artists WHERE name LIKE ? ORDER BY name COLLATE NOCASE LIMIT 20").bind(like).all() : {results:[]};
    const albums = type==="all"||type==="albums" ? await env.DB.prepare("SELECT al.id,al.title,a.name AS artist,a.id AS artistId FROM albums al JOIN artists a ON a.id=al.artist_id WHERE al.title LIKE ? OR a.name LIKE ? ORDER BY al.title LIMIT 20").bind(like,like).all() : {results:[]};
    const playlists = type==="all"||type==="playlists" ? await env.DB.prepare("SELECT p.id,p.name,p.description,u.username AS owner FROM playlists p JOIN users u ON u.id=p.user_id WHERE p.name LIKE ? LIMIT 20").bind(like).all() : {results:[]};
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
    const userId=await requireUser(request,env);
    const playlists=await env.DB.prepare("SELECT id,name,description,cover_key AS coverKey,updated_at AS updatedAt FROM playlists WHERE user_id=? ORDER BY updated_at DESC").bind(userId).all();
    return json({playlists:playlists.results.map((p:any)=>({...p,cover:mediaUrl(p.coverKey)}))});
  }

  if(path==="/v1/me/playlists" && request.method==="POST"){
    const userId=await requireUser(request,env); const body=await request.json() as {id?:string;name?:string;description?:string};
    const name=body.name?.trim()||""; if(!name||name.length>80)return fail("Playlist name must be 1–80 characters.");
    const playlistId=id(); await env.DB.prepare("INSERT INTO playlists (id,user_id,name,description) VALUES (?,?,?,?)").bind(playlistId,userId,name,body.description?.slice(0,500)||null).run();
    return json({id:playlistId,name,description:body.description||"",cover:"",trackIds:[],updatedAt:Date.now()},201);
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
    const form=await request.formData();
    const title=String(form.get("title")||"").trim(); const artistName=String(form.get("artist")||"").trim();
    const albumTitle=String(form.get("album")||"").trim(); const rights=String(form.get("rightsStatus")||"");
    const rightsReference=String(form.get("rightsReference")||"").trim();
    const rightsConfirmed=String(form.get("rightsConfirmed")||"")==="true";
    const audio=form.get("audio"); const image=form.get("artwork");
    if(!title||title.length>180||!artistName||artistName.length>140)return fail("Track title and artist are required.");
    if(!(audio instanceof File)||audio.size<1||audio.size>45*1024*1024)return fail("Audio file is required and must be 45 MB or smaller.");
    if(!AUDIO_TYPES.has(audio.type))return fail("Unsupported audio format. Use MP3, AAC, M4A, WAV, FLAC, OGG, OPUS or WebM.");
    if(image && (!(image instanceof File)||!IMAGE_TYPES.has(image.type)||image.size>7*1024*1024))return fail("Artwork must be JPG, PNG, WebP or AVIF and no larger than 7 MB.");
    if(!rightsConfirmed||!["owned","licensed","public_domain"].includes(rights)||!rightsReference)return fail("Confirm your rights to distribute this recording and provide a rights reference.");
    const trackId=id(); const audioKey="audio/"+trackId+"."+safeName(audio.name).split(".").pop()!.toLowerCase();
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
      await env.MEDIA.put(audioKey,audio.stream(),{httpMetadata:{contentType:audio.type,cacheControl:"public, max-age=31536000, immutable"}});
      if(image instanceof File){await env.MEDIA.put(imageKey!,image.stream(),{httpMetadata:{contentType:image.type,cacheControl:"public, max-age=31536000, immutable"}});}
      await env.DB.prepare("INSERT INTO tracks (id,title,artist_id,album_id,duration_ms,genre,explicit,audio_key,audio_mime,audio_size,artwork_key,rights_status,rights_reference,published) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)")
        .bind(trackId,title,artistId,albumId,Math.max(0,Number(form.get("durationMs")||0)),String(form.get("genre")||"").slice(0,80)||null,String(form.get("explicit")||"")==="true"?1:0,audioKey,audio.type,audio.size,imageKey,rights,rightsReference.slice(0,500)).run();
    }catch(error){
      await env.MEDIA.delete([audioKey,...(imageKey?[imageKey]:[])]);
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
