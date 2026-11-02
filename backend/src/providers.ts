export type ProviderName = "spotify" | "soundcloud" | "youtube" | "apple_music";
export type ImportKind = "track" | "playlist" | "album";
export type ImportedTrack = {
  providerId: string; title: string; artist: string; externalUrl: string;
  artwork?: string; durationMs?: number; embedUrl?: string;
};
export type ResolvedImport = {
  provider: ProviderName; kind: ImportKind; providerId: string;
  title: string; subtitle: string; externalUrl: string; artwork?: string;
  embedUrl?: string; tracks: ImportedTrack[];
};
export interface ProviderEnv {
  SPOTIFY_CLIENT_ID?: string; SPOTIFY_CLIENT_SECRET?: string;
  SOUNDCLOUD_CLIENT_ID?: string; SOUNDCLOUD_CLIENT_SECRET?: string;
  YOUTUBE_API_KEY?: string; APPLE_MUSIC_DEVELOPER_TOKEN?: string;
}
const timeout = (ms = 12000) => AbortSignal.timeout(ms);
async function providerJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: init.signal || timeout() });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Provider request failed (${response.status})${detail ? ": " + detail.slice(0,160) : ""}`);
  }
  return response.json() as Promise<any>;
}
function clean(value: unknown, limit = 180) { return typeof value === "string" ? value.trim().slice(0,limit) : ""; }
function firstImage(images: any): string | undefined {
  const item = Array.isArray(images) ? images[0] : images;
  const url = typeof item === "string" ? item : item?.url;
  return typeof url === "string" && /^https:\/\//i.test(url) ? url : undefined;
}
function safeExternalUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Only HTTPS music links are supported.");
  return url.toString();
}
function spotifyParts(url: URL) {
  const match = url.pathname.match(/^\/(track|playlist|album|artist)\/([a-zA-Z0-9]+)\/?$/);
  if (!match) throw new Error("That Spotify link type isn't supported.");
  return { kind: match[1] as string, id: match[2] };
}
async function spotifyToken(env: ProviderEnv) {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) throw new Error("Spotify import isn't configured on LYNE yet. Add the Spotify API credentials to the LYNE backend.");
  const basic = btoa(env.SPOTIFY_CLIENT_ID + ":" + env.SPOTIFY_CLIENT_SECRET);
  const form = new URLSearchParams({ grant_type: "client_credentials" });
  const token = await providerJson("https://accounts.spotify.com/api/token", { method:"POST", headers:{ Authorization:"Basic "+basic, "Content-Type":"application/x-www-form-urlencoded" }, body:form });
  if (!token.access_token) throw new Error("Spotify didn't provide an API token.");
  return token.access_token as string;
}
async function spotifyImport(url: URL, env: ProviderEnv): Promise<ResolvedImport> {
  const { kind, id } = spotifyParts(url);
  if (kind === "artist") throw new Error("Paste a Spotify song, album or playlist link. Artist-only imports aren't library items yet.");
  const token = await spotifyToken(env);
  const data = await providerJson(`https://api.spotify.com/v1/${kind}s/${id}?market=CA`, { headers:{ Authorization:"Bearer "+token } });
  const externalUrl = data.external_urls?.spotify || url.toString();
  const trackFrom = (item: any): ImportedTrack | null => {
    const t = item?.track || item;
    if (!t?.id || !t?.name) return null;
    const artists = (t.artists||[]).map((a:any)=>a.name).filter(Boolean).join(", ");
    return { providerId:t.id,title:clean(t.name),artist:clean(artists,180),externalUrl:t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,artwork:firstImage(t.album?.images),durationMs:Number(t.duration_ms)||undefined,embedUrl:`https://open.spotify.com/embed/track/${t.id}` };
  };
  let tracks: ImportedTrack[] = [];
  if(kind==="track"){const one=trackFrom(data);if(one)tracks=[one];}
  else {
    const items=kind==="album"?(data.tracks?.items||[]):(data.tracks?.items||[]);
    tracks=items.map(trackFrom).filter(Boolean).slice(0,100) as ImportedTrack[];
  }
  return { provider:"spotify",kind:kind as ImportKind,providerId:id,title:clean(data.name)||"Untitled",subtitle:kind==="track"?(tracks[0]?.artist||"Spotify"):(kind==="album"?(data.artists||[]).map((a:any)=>a.name).join(", "):clean(data.owner?.display_name)||"Spotify playlist"),externalUrl,artwork:firstImage(kind==="track"?data.album?.images:data.images),embedUrl:`https://open.spotify.com/embed/${kind}/${id}`,tracks };
}
async function soundcloudToken(env: ProviderEnv) {
  if (!env.SOUNDCLOUD_CLIENT_ID || !env.SOUNDCLOUD_CLIENT_SECRET) throw new Error("SoundCloud import isn't configured on LYNE yet. Add the SoundCloud API credentials to the LYNE backend.");
  const basic=btoa(env.SOUNDCLOUD_CLIENT_ID+":"+env.SOUNDCLOUD_CLIENT_SECRET);
  const form=new URLSearchParams({ grant_type:"client_credentials" });
  const data=await providerJson("https://secure.soundcloud.com/oauth/token",{method:"POST",headers:{Authorization:"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded"},body:form});
  if(!data.access_token)throw new Error("SoundCloud didn't provide an API token.");
  return data.access_token as string;
}
async function soundcloudImport(url: URL, env: ProviderEnv): Promise<ResolvedImport> {
  const token=await soundcloudToken(env);
  const data=await providerJson("https://api.soundcloud.com/resolve?url="+encodeURIComponent(url.toString()),{headers:{Authorization:"OAuth "+token,Accept:"application/json; charset=utf-8"}});
  const kind=(data.kind==="playlist"||data.kind==="system-playlist")?"playlist":"track";
  const tracks:ImportedTrack[]=(kind==="track"?[data]:(data.tracks||[])).filter((t:any)=>t?.id).slice(0,100).map((t:any)=>({providerId:String(t.id),title:clean(t.title),artist:clean(t.user?.username||t.publisher_metadata?.artist),externalUrl:t.permalink_url||url.toString(),artwork:firstImage(t.artwork_url),durationMs:Number(t.duration)||undefined,embedUrl:"https://w.soundcloud.com/player/?url="+encodeURIComponent(t.permalink_url||url.toString())}));
  return {provider:"soundcloud",kind,providerId:String(data.id),title:clean(data.title)||"SoundCloud item",subtitle:kind==="track"?clean(data.user?.username):clean(data.user?.username||data.description),externalUrl:data.permalink_url||url.toString(),artwork:firstImage(data.artwork_url),embedUrl:"https://w.soundcloud.com/player/?url="+encodeURIComponent(data.permalink_url||url.toString()),tracks};
}
function youtubeIdFromUrl(url: URL) {
  if(url.hostname==="youtu.be") return url.pathname.slice(1);
  if(url.searchParams.get("v")) return url.searchParams.get("v")!;
  const match=url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/);
  return match?.[1]||"";
}
async function youtubeImport(url: URL, env: ProviderEnv): Promise<ResolvedImport> {
  if(!env.YOUTUBE_API_KEY)throw new Error("YouTube import isn't configured on LYNE yet. Add a YouTube Data API key to the LYNE backend.");
  const playlistId=url.searchParams.get("list");
  const videoId=youtubeIdFromUrl(url);
  const apiBase="https://www.googleapis.com/youtube/v3/";
  const get=async(path:string,params:Record<string,string>)=>{const q=new URLSearchParams({...params,key:env.YOUTUBE_API_KEY!});return providerJson(apiBase+path+"?"+q.toString());};
  if(playlistId){
    const playlist=await get("playlists",{part:"snippet,contentDetails",id:playlistId});
    const p=playlist.items?.[0];if(!p)throw new Error("YouTube playlist wasn't found or isn't public.");
    const page=await get("playlistItems",{part:"snippet,contentDetails",playlistId,maxResults:"50"});
    const items=(page.items||[]).filter((i:any)=>i.snippet?.resourceId?.videoId);
    const ids=items.map((i:any)=>i.snippet.resourceId.videoId);
    const details=ids.length?await get("videos",{part:"snippet,contentDetails",id:ids.join(",")}):{items:[]};
    const detailMap=new Map((details.items||[]).map((v:any)=>[v.id,v]));
    const tracks:ImportedTrack[]=items.map((i:any)=>{const id=i.snippet.resourceId.videoId;const v:any=detailMap.get(id);return {providerId:id,title:clean(v?.snippet?.title||i.snippet.title),artist:clean(v?.snippet?.channelTitle||i.snippet.videoOwnerChannelTitle),externalUrl:"https://www.youtube.com/watch?v="+id,artwork:firstImage(v?.snippet?.thumbnails||i.snippet.thumbnails),embedUrl:"https://www.youtube-nocookie.com/embed/"+id};});
    return {provider:"youtube",kind:"playlist",providerId:playlistId,title:clean(p.snippet?.title)||"YouTube playlist",subtitle:clean(p.snippet?.channelTitle)||"YouTube",externalUrl:url.toString(),artwork:firstImage(p.snippet?.thumbnails),embedUrl:"https://www.youtube.com/embed/videoseries?list="+encodeURIComponent(playlistId),tracks};
  }
  if(!videoId)throw new Error("Paste a YouTube song/video or playlist link.");
  const result=await get("videos",{part:"snippet,contentDetails",id:videoId});
  const v=result.items?.[0];if(!v)throw new Error("YouTube video wasn't found or is unavailable.");
  const track:ImportedTrack={providerId:videoId,title:clean(v.snippet?.title),artist:clean(v.snippet?.channelTitle),externalUrl:"https://www.youtube.com/watch?v="+videoId,artwork:firstImage(v.snippet?.thumbnails),embedUrl:"https://www.youtube-nocookie.com/embed/"+videoId};
  return {provider:"youtube",kind:"track",providerId:videoId,title:track.title,subtitle:track.artist,externalUrl:track.externalUrl,artwork:track.artwork,embedUrl:track.embedUrl,tracks:[track]};
}
async function appleImport(url: URL, env: ProviderEnv): Promise<ResolvedImport> {
  if(!env.APPLE_MUSIC_DEVELOPER_TOKEN)throw new Error("Apple Music import isn't configured on LYNE yet. Add an Apple Music developer token to the LYNE backend.");
  const match=url.pathname.match(/^\/([a-z]{2})\/(album|playlist|song)\/.*\/(\d+)\/?$/i);
  const songId=url.searchParams.get("i");
  const storefront=match?.[1]||"us";
  const kind:ImportKind=songId||match?.[2]==="song"?"track":match?.[2]==="playlist"?"playlist":"album";
  const id=songId||match?.[3];
  if(!id)throw new Error("Paste an Apple Music song, album or playlist link.");
  const resource=kind==="track"?"songs":kind==="playlist"?"playlists":"albums";
  const data=await providerJson(`https://api.music.apple.com/v1/catalog/${storefront}/${resource}/${id}?include=tracks`,{headers:{Authorization:"Bearer "+env.APPLE_MUSIC_DEVELOPER_TOKEN}});
  const item=data.data?.[0];if(!item)throw new Error("Apple Music item wasn't found in that storefront.");
  const attrs=item.attributes||{};
  const rawTracks=kind==="track"?[item]:(item.relationships?.tracks?.data||[]);
  const tracks:ImportedTrack[]=rawTracks.slice(0,100).map((t:any)=>({providerId:t.id,title:clean(t.attributes?.name),artist:clean(t.attributes?.artistName),externalUrl:t.attributes?.url||url.toString(),artwork:t.attributes?.artwork?.url?.replace("{w}","600").replace("{h}","600"),durationMs:Number(t.attributes?.durationInMillis)||undefined,embedUrl:t.attributes?.url}));
  return {provider:"apple_music",kind,providerId:id,title:clean(attrs.name)||"Apple Music item",subtitle:clean(attrs.artistName)||clean(attrs.curatorName)||"Apple Music",externalUrl:attrs.url||url.toString(),artwork:attrs.artwork?.url?.replace("{w}","600").replace("{h}","600"),embedUrl:attrs.url,tracks};
}
export async function resolveMusicLink(raw: string, env: ProviderEnv): Promise<ResolvedImport> {
  let url:URL;
  try{url=new URL(raw.trim());}catch{throw new Error("Paste a valid music link.");}
  const externalUrl=safeExternalUrl(url.toString());
  const host=url.hostname.toLowerCase().replace(/^www\./,"");
  if(host==="open.spotify.com"||host==="spotify.link")return spotifyImport(url,env);
  if(host==="soundcloud.com"||host==="m.soundcloud.com")return soundcloudImport(url,env);
  if(host==="youtu.be"||host==="youtube.com"||host==="music.youtube.com"||host==="www.youtube.com")return youtubeImport(url,env);
  if(host==="music.apple.com")return appleImport(url,env);
  throw new Error("Supported links: Spotify, SoundCloud, YouTube and Apple Music.");
}
