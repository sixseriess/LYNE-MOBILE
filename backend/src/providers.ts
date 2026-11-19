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
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) throw new Error("Spotify API credentials are not configured.");
  const basic = btoa(env.SPOTIFY_CLIENT_ID + ":" + env.SPOTIFY_CLIENT_SECRET);
  const form = new URLSearchParams({ grant_type: "client_credentials" });
  const token = await providerJson("https://accounts.spotify.com/api/token", { method:"POST", headers:{ Authorization:"Basic "+basic, "Content-Type":"application/x-www-form-urlencoded" }, body:form });
  if (!token.access_token) throw new Error("Spotify didn't provide an API token.");
  return token.access_token as string;
}
function findSpotifyEmbedEntity(value:any,depth=0):any{
  if(!value||typeof value!=="object"||depth>18)return null;
  if(!Array.isArray(value)&&Array.isArray(value.trackList)&&(typeof value.title==="string"||typeof value.name==="string"))return value;
  const entries=Array.isArray(value)?value:Object.values(value);
  for(const child of entries){const found=findSpotifyEmbedEntity(child,depth+1);if(found)return found;}
  return null;
}
async function spotifyEmbedImport(url:URL):Promise<ResolvedImport>{
  const {kind,id}=spotifyParts(url);
  if(kind==="artist")throw new Error("Paste a Spotify song, album or playlist link.");
  const html=await (await fetch("https://open.spotify.com/embed/"+kind+"/"+encodeURIComponent(id),{headers:{accept:"text/html"}})).text();
  const scripts=[...html.matchAll(/<script[^>]*id="(?:__NEXT_DATA__|initial-state|session)"[^>]*>([\s\S]*?)<\/script>/gi)];
  let entity:any=null;
  for(const script of scripts){try{entity=findSpotifyEmbedEntity(JSON.parse(script[1]));if(entity)break;}catch{}}
  if(!entity)throw new Error("Spotify returned the item details but not its track list. Try again in a moment.");
  const splitArtists=(raw:any)=>String(raw||"").split(/,[\s\u00a0]+/).map((x:string)=>x.trim()).filter(Boolean);
  const title=clean(entity.title||entity.name)||"Spotify item";
  const subtitle=clean(entity.subtitle)||"Spotify";
  const tracks:ImportedTrack[]=(Array.isArray(entity.trackList)?entity.trackList:[]).map((item:any)=>{
    const uri=String(item?.uri||"");
    const artists=splitArtists(item?.subtitle);
    const cover=Array.isArray(item?.coverArt?.sources)?item.coverArt.sources[0]?.url:undefined;
    const trackTitle=clean(item?.title);
    const providerId=uri.split(":").pop()||String(item?.uid||"");
    if(!trackTitle||!providerId)return null;
    return {providerId,title:trackTitle,artist:artists.join(", ")||"Spotify Artist",externalUrl:"https://open.spotify.com/track/"+providerId,artwork:firstImage(cover),durationMs:Number(item?.duration)||undefined,embedUrl:"https://open.spotify.com/embed/track/"+providerId};
  }).filter(Boolean).slice(0,100) as ImportedTrack[];
  if(kind==="track"&&!tracks.length){
    const artists=splitArtists(entity.subtitle);
    tracks.push({providerId:id,title,artist:artists.join(", ")||subtitle,externalUrl:url.toString(),embedUrl:"https://open.spotify.com/embed/track/"+id});
  }
  const cover=Array.isArray(entity.coverArt?.sources)?entity.coverArt.sources[0]?.url:undefined;
  return {provider:"spotify",kind:kind as ImportKind,providerId:id,title,subtitle,externalUrl:url.toString(),artwork:firstImage(cover),embedUrl:"https://open.spotify.com/embed/"+kind+"/"+id,tracks};
}
async function spotifyOembedImport(url:URL):Promise<ResolvedImport>{
  const {kind,id}=spotifyParts(url);
  if(kind==="artist")throw new Error("Paste a Spotify song, album or playlist link. Artist-only imports aren't library items yet.");
  const data=await providerJson("https://open.spotify.com/oembed?url="+encodeURIComponent(url.toString()));
  const title=clean(data.title)||"Spotify item";
  const artwork=firstImage(data.thumbnail_url);
  const embedUrl=`https://open.spotify.com/embed/${kind}/${id}`;
  const track:ImportedTrack={providerId:id,title,artist:"Spotify",externalUrl:url.toString(),artwork,embedUrl};
  return {provider:"spotify",kind:kind as ImportKind,providerId:id,title,subtitle:"Spotify",externalUrl:url.toString(),artwork,embedUrl,tracks:kind==="track"?[track]:[]};
}
async function spotifyImport(url: URL, env: ProviderEnv): Promise<ResolvedImport> {
  const { kind, id } = spotifyParts(url);
  if (kind === "artist") throw new Error("Paste a Spotify song, album or playlist link. Artist-only imports aren't library items yet.");
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return spotifyEmbedImport(url);
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

let cachedSoundCloudClientId:string|undefined;
async function getSoundCloudClientId(configured?:string):Promise<string>{
  if(configured?.trim())return configured.trim();
  if(cachedSoundCloudClientId)return cachedSoundCloudClientId;
  const home=await fetch("https://soundcloud.com",{headers:{accept:"text/html,application/xhtml+xml"}});
  if(!home.ok)throw new Error("SoundCloud is unavailable right now.");
  const html=await home.text();
  const scripts=[...html.matchAll(/src="([^"]+\.js)"/g)]
    .map(match=>match[1].startsWith("//")?"https:"+match[1]:match[1])
    .filter(url=>url.includes("a-v2.sndcdn.com/assets/"))
    .reverse();
  for(const script of scripts){
    const response=await fetch(script);
    if(!response.ok)continue;
    const source=await response.text();
    const found=source.match(/client_id[ \t]*[:=][ \t]*"([a-zA-Z0-9]{32})"/)?.[1];
    if(found){cachedSoundCloudClientId=found;return found;}
  }
  throw new Error("Could not initialize the official SoundCloud API client.");
}
async function soundCloudApiJson(path:string,clientId:string):Promise<any>{
  const url=new URL(path,"https://api-v2.soundcloud.com");
  url.searchParams.set("client_id",clientId);
  return providerJson(url.toString());
}

async function soundcloudToken(env: ProviderEnv) {
  if (!env.SOUNDCLOUD_CLIENT_ID || !env.SOUNDCLOUD_CLIENT_SECRET) throw new Error("SoundCloud API credentials are not configured.");
  const basic=btoa(env.SOUNDCLOUD_CLIENT_ID+":"+env.SOUNDCLOUD_CLIENT_SECRET);
  const form=new URLSearchParams({ grant_type:"client_credentials" });
  const data=await providerJson("https://secure.soundcloud.com/oauth/token",{method:"POST",headers:{Authorization:"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded"},body:form});
  if(!data.access_token)throw new Error("SoundCloud didn't provide an API token.");
  return data.access_token as string;
}
async function soundcloudOembedImport(url:URL):Promise<ResolvedImport>{
  const data=await providerJson("https://soundcloud.com/oembed?format=json&url="+encodeURIComponent(url.toString()));
  const playlist=/\/sets\//i.test(url.pathname);
  const kind:ImportKind=playlist?"playlist":"track";
  const title=clean(data.title)||"SoundCloud item";
  const artwork=firstImage(data.thumbnail_url);
  const embedUrl="https://w.soundcloud.com/player/?url="+encodeURIComponent(url.toString())+"&auto_play=false";
  const by=title.match(/^(.*?)\s+by\s+(.+)$/i);
  const track:ImportedTrack={providerId:url.pathname.replace(/^\/+|\/+$/g,""),title:by?.[1]||title,artist:by?.[2]||"SoundCloud",externalUrl:url.toString(),artwork,embedUrl};
  return {provider:"soundcloud",kind,providerId:track.providerId,title,subtitle:by?.[2]||"SoundCloud",externalUrl:url.toString(),artwork,embedUrl,tracks:kind==="track"?[track]:[]};
}
async function soundcloudImport(url: URL, env: ProviderEnv): Promise<ResolvedImport> {
  const clientId=await getSoundCloudClientId(env.SOUNDCLOUD_CLIENT_ID);
  const data=await soundCloudApiJson("/resolve?url="+encodeURIComponent(url.toString()),clientId);
  const kind=(data.kind==="playlist"||data.kind==="system-playlist")?"playlist":"track";
  const tracks:ImportedTrack[]=(kind==="track"?[data]:(data.tracks||[])).filter((t:any)=>t?.id).slice(0,100).map((t:any)=>({
    providerId:String(t.id),
    title:clean(t.title),
    artist:clean(t.user?.username||t.publisher_metadata?.artist),
    externalUrl:t.permalink_url||url.toString(),
    artwork:firstImage(t.artwork_url),
    durationMs:Number(t.duration)||undefined,
    embedUrl:"https://w.soundcloud.com/player/?url="+encodeURIComponent(t.permalink_url||url.toString())
  }));
  return {
    provider:"soundcloud",
    kind,
    providerId:String(data.id),
    title:clean(data.title)||"SoundCloud item",
    subtitle:kind==="track"?clean(data.user?.username):clean(data.user?.username||data.description),
    externalUrl:data.permalink_url||url.toString(),
    artwork:firstImage(data.artwork_url),
    embedUrl:"https://w.soundcloud.com/player/?url="+encodeURIComponent(data.permalink_url||url.toString()),
    tracks
  };
}
function youtubeIdFromUrl(url: URL) {
  if(url.hostname==="youtu.be") return url.pathname.slice(1);
  if(url.searchParams.get("v")) return url.searchParams.get("v")!;
  const match=url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/);
  return match?.[1]||"";
}
function extractEmbeddedJson(html:string,marker:string):any|null{
  const markerAt=html.indexOf(marker);
  if(markerAt<0)return null;
  const start=html.indexOf("{",markerAt);
  if(start<0)return null;
  let depth=0,inString=false,escaped=false;
  for(let index=start;index<html.length;index++){
    const char=html[index];
    if(inString){
      if(escaped)escaped=false;
      else if(char==="\\")escaped=true;
      else if(char==='"')inString=false;
      continue;
    }
    if(char==='"')inString=true;
    else if(char==="{")depth++;
    else if(char==="}"&&--depth===0){try{return JSON.parse(html.slice(start,index+1));}catch{return null;}}
  }
  return null;
}
function findYoutubePlaylistRenderer(value:any,depth=0):any{
  if(!value||typeof value!=="object"||depth>22)return null;
  if(!Array.isArray(value)&&Array.isArray(value.contents)&&value.contents.some((item:any)=>item?.playlistVideoRenderer))return value;
  const entries=Array.isArray(value)?value:Object.values(value);
  for(const child of entries){const found=findYoutubePlaylistRenderer(child,depth+1);if(found)return found;}
  return null;
}
async function youtubePlaylistHtmlImport(url:URL,playlistId:string):Promise<ResolvedImport>{
  const response=await fetch("https://www.youtube.com/playlist?list="+encodeURIComponent(playlistId),{headers:{accept:"text/html"}});
  if(!response.ok)throw new Error("YouTube playlist page could not be loaded.");
  const html=await response.text();
  const data=extractEmbeddedJson(html,"ytInitialData")||extractEmbeddedJson(html,'window["ytInitialData"]');
  if(!data)throw new Error("YouTube did not provide a public playlist track list.");
  const renderer=findYoutubePlaylistRenderer(data);
  const tracks:ImportedTrack[]=(renderer?.contents||[]).map((entry:any)=>{
    const video=entry?.playlistVideoRenderer;
    const videoId=String(video?.videoId||"");
    const title=clean(video?.title?.runs?.map((x:any)=>x.text).join("")||video?.title?.simpleText);
    const artist=clean(video?.shortBylineText?.runs?.map((x:any)=>x.text).join("")||video?.videoOwnerRenderer?.title?.runs?.map((x:any)=>x.text).join(""));
    const thumbs=video?.thumbnail?.thumbnails;
    if(!/^[a-zA-Z0-9_-]{11}$/.test(videoId)||!title)return null;
    return {providerId:videoId,title,artist:artist||"YouTube",externalUrl:"https://www.youtube.com/watch?v="+videoId,artwork:firstImage(thumbs?.slice(-1)[0]?.url),embedUrl:"https://www.youtube-nocookie.com/embed/"+videoId};
  }).filter(Boolean).slice(0,100) as ImportedTrack[];
  if(!tracks.length)throw new Error("No public tracks were found in that YouTube playlist.");
  const title=clean(data?.metadata?.playlistMetadataRenderer?.title||data?.microformat?.playerMicroformatRenderer?.title?.simpleText)||"YouTube playlist";
  return {provider:"youtube",kind:"playlist",providerId:playlistId,title,subtitle:"YouTube",externalUrl:url.toString(),tracks};
}
async function youtubeOembedImport(url:URL):Promise<ResolvedImport>{
  const playlistId=url.searchParams.get("list");
  const videoId=youtubeIdFromUrl(url);
  if(playlistId)return youtubePlaylistHtmlImport(url,playlistId);
  if(!videoId)throw new Error("Paste a YouTube video link. YouTube playlist track lists require the official Data API key.");
  const data=await providerJson("https://www.youtube.com/oembed?format=json&url="+encodeURIComponent(url.toString()));
  const title=clean(data.title)||"YouTube video";
  const artist=clean(data.author_name)||"YouTube";
  const artwork=firstImage(data.thumbnail_url);
  const externalUrl="https://www.youtube.com/watch?v="+videoId;
  const embedUrl="https://www.youtube-nocookie.com/embed/"+videoId;
  const track:ImportedTrack={providerId:videoId,title,artist,externalUrl,artwork,embedUrl};
  return {provider:"youtube",kind:"track",providerId:videoId,title,subtitle:artist,externalUrl,artwork,embedUrl,tracks:[track]};
}
async function youtubeImport(url: URL, env: ProviderEnv): Promise<ResolvedImport> {
  if(!env.YOUTUBE_API_KEY)return youtubeOembedImport(url);
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
function appleEmbedUrl(raw?:string):string|undefined{
  if(!raw)return undefined;
  try{const embed=new URL(raw);if(embed.protocol!=="https:"||embed.hostname!=="music.apple.com")return undefined;embed.hostname="embed.music.apple.com";return embed.toString();}
  catch{return undefined;}
}
function findApplePlaylist(value:any,depth=0):any{
  if(!value||typeof value!=="object"||depth>18)return null;
  if(!Array.isArray(value)){
    const type=value["@type"];
    if((type==="MusicPlaylist"||type==="Playlist"||Array.isArray(type)&&type.includes("MusicPlaylist"))&&Array.isArray(value.track))return value;
  }
  const children=Array.isArray(value)?value:Object.values(value);
  for(const child of children){const found=findApplePlaylist(child,depth+1);if(found)return found;}
  return null;
}
async function applePlaylistPageImport(url:URL,id:string,storefront:string):Promise<ResolvedImport>{
  const response=await fetch(url.toString(),{headers:{accept:"text/html"}});
  if(!response.ok)throw new Error("Apple Music playlist page could not be loaded.");
  const html=await response.text();
  const scripts=[...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let playlist:any=null;
  for(const script of scripts){try{playlist=findApplePlaylist(JSON.parse(script[1]));if(playlist)break;}catch{}}
  if(!playlist)throw new Error("Apple Music did not expose this playlist's track list. Its developer-token API connection is still required for this playlist.");
  const tracks:ImportedTrack[]=(playlist.track||[]).map((item:any)=>{
    const name=clean(item?.name);
    const artist=clean(item?.byArtist?.name||item?.byArtist?.[0]?.name);
    const external=typeof item?.url==="string"?item.url:url.toString();
    const parsedId=external.match(/\/id(\d+)/)?.[1]||external.match(/\/(\d+)(?:\?|$)/)?.[1];
    if(!name||!parsedId)return null;
    return {providerId:parsedId,title:name,artist:artist||"Apple Music",externalUrl:safeExternalUrl(external),artwork:firstImage(item?.image)};
  }).filter(Boolean).slice(0,100) as ImportedTrack[];
  if(!tracks.length)throw new Error("No public tracks were found in that Apple Music playlist.");
  return {provider:"apple_music",kind:"playlist",providerId:id,title:clean(playlist.name)||"Apple Music playlist",subtitle:clean(playlist.creator?.name)||"Apple Music",externalUrl:url.toString(),artwork:firstImage(playlist.image),tracks};
}
async function appleItunesLookup(url:URL,id:string,kind:ImportKind,storefront:string):Promise<ResolvedImport>{
  if(kind==="playlist")return applePlaylistPageImport(url,id,storefront);
  const query=new URLSearchParams({id,country:storefront});
  if(kind==="album")query.set("entity","song");
  const data=await providerJson("https://itunes.apple.com/lookup?"+query.toString());
  const results=Array.isArray(data.results)?data.results:[];
  const songResults=results.filter((item:any)=>item.wrapperType==="track"&&item.kind==="song");
  const albumResult=results.find((item:any)=>item.wrapperType==="collection");
  if(kind==="track"&&!songResults.length)throw new Error("Apple couldn't find that song through its public music catalogue.");
  if(kind==="album"&&!albumResult)throw new Error("Apple couldn't find that album through its public music catalogue.");
  const tracks:ImportedTrack[]=songResults.slice(0,100).map((item:any)=>({
    providerId:String(item.trackId),
    title:clean(item.trackName)||"Apple Music track",
    artist:clean(item.artistName)||"Apple Music",
    externalUrl:safeExternalUrl(item.trackViewUrl||url.toString()),
    artwork:firstImage(item.artworkUrl600||item.artworkUrl100),
    durationMs:Number(item.trackTimeMillis)||undefined,
    embedUrl:appleEmbedUrl(item.trackViewUrl),
  }));
  const main=kind==="track"?songResults[0]:albumResult;
  const title=clean(kind==="track"?main.trackName:main.collectionName)||"Apple Music item";
  const subtitle=clean(main.artistName)||"Apple Music";
  const externalUrl=safeExternalUrl((kind==="track"?main.trackViewUrl:main.collectionViewUrl)||url.toString());
  const artwork=firstImage(main.artworkUrl600||main.artworkUrl100);
  const embedUrl=appleEmbedUrl(externalUrl);
  return {provider:"apple_music",kind,providerId:id,title,subtitle,externalUrl,artwork,embedUrl,tracks:kind==="track"?tracks.slice(0,1):tracks};
}
async function appleImport(url: URL, env: ProviderEnv): Promise<ResolvedImport> {
  const match=url.pathname.match(/^\/([a-z]{2})\/(album|playlist|song)\/.*\/(\d+)\/?$/i);
  const songId=url.searchParams.get("i");
  const storefront=match?.[1]||"us";
  const kind:ImportKind=songId||match?.[2]==="song"?"track":match?.[2]==="playlist"?"playlist":"album";
  const id=songId||match?.[3];
  if(!id)throw new Error("Paste an Apple Music song, album or playlist link.");
  if(!env.APPLE_MUSIC_DEVELOPER_TOKEN)return appleItunesLookup(url,id,kind,storefront);
  const resource=kind==="track"?"songs":kind==="playlist"?"playlists":"albums";
  const data=await providerJson(`https://api.music.apple.com/v1/catalog/${storefront}/${resource}/${id}?include=tracks`,{headers:{Authorization:"Bearer "+env.APPLE_MUSIC_DEVELOPER_TOKEN}});
  const item=data.data?.[0];if(!item)throw new Error("Apple Music item wasn't found in that storefront.");
  const attrs=item.attributes||{};
  const rawTracks=kind==="track"?[item]:(item.relationships?.tracks?.data||[]);
  const tracks:ImportedTrack[]=rawTracks.slice(0,100).map((t:any)=>({providerId:t.id,title:clean(t.attributes?.name),artist:clean(t.attributes?.artistName),externalUrl:t.attributes?.url||url.toString(),artwork:t.attributes?.artwork?.url?.replace("{w}","600").replace("{h}","600"),durationMs:Number(t.attributes?.durationInMillis)||undefined,embedUrl:appleEmbedUrl(t.attributes?.url)}));
  return {provider:"apple_music",kind,providerId:id,title:clean(attrs.name)||"Apple Music item",subtitle:clean(attrs.artistName)||clean(attrs.curatorName)||"Apple Music",externalUrl:attrs.url||url.toString(),artwork:attrs.artwork?.url?.replace("{w}","600").replace("{h}","600"),embedUrl:appleEmbedUrl(attrs.url),tracks};
}
export async function resolveMusicLink(raw: string, env: ProviderEnv): Promise<ResolvedImport> {
  let url:URL;
  try{url=new URL(raw.trim());}catch{throw new Error("Paste a valid music link.");}
  const externalUrl=safeExternalUrl(url.toString());
  const host=url.hostname.toLowerCase().replace(/^www\./,"");
  if(host==="spotify.link"){
    const redirected=await fetch(url.toString(),{redirect:"follow",signal:timeout()});
    const resolvedUrl=new URL(redirected.url);
    if(resolvedUrl.hostname.replace(/^www\./,"")!=="open.spotify.com")throw new Error("That Spotify short link didn't resolve to a supported Spotify item.");
    return spotifyImport(resolvedUrl,env);
  }
  if(host==="open.spotify.com")return spotifyImport(url,env);
  if(host==="soundcloud.com"||host==="m.soundcloud.com")return soundcloudImport(url,env);
  if(host==="youtu.be"||host==="youtube.com"||host==="music.youtube.com"||host==="www.youtube.com")return youtubeImport(url,env);
  if(host==="music.apple.com")return appleImport(url,env);
  throw new Error("Supported links: Spotify, SoundCloud, YouTube and Apple Music.");
}


export type SoundCloudPlaybackResult = { url:string; mimeType:string; durationMs?:number; expiresAt?:string };

export async function resolveSoundCloudPlayback(providerId:string,env:ProviderEnv):Promise<SoundCloudPlaybackResult>{
  if(!/^\d{1,20}$/.test(providerId))throw new Error("Invalid SoundCloud track ID.");
  const clientId=await getSoundCloudClientId(env.SOUNDCLOUD_CLIENT_ID);
  const track=await soundCloudApiJson("/tracks/"+providerId,clientId);
  if(track?.policy==="BLOCK"||track?.streamable===false)throw new Error("This SoundCloud track is not available for streaming.");
  const duration=Number(track?.duration)||0;
  const fullDuration=Number(track?.full_duration)||duration;
  if(fullDuration>0&&duration>0&&duration+5000<fullDuration)throw new Error("SoundCloud only provides a preview for this track.");
  const transcodings=Array.isArray(track?.media?.transcodings)?track.media.transcodings:[];
  const playable=transcodings.filter((item:any)=>{
    const format=item?.format||{};
    const protocol=String(format.protocol||"");
    const mime=String(format.mime_type||"").toLowerCase();
    return item?.snipped!==true&&protocol==="progressive"&&!mime.includes("mpegurl");
  }).sort((a:any,b:any)=>{
    const rank=(item:any)=>item?.format?.protocol==="progressive"?(String(item?.format?.mime_type||"").includes("mpeg")?0:1):2;
    return rank(a)-rank(b);
  });
  if(!playable.length)throw new Error("SoundCloud has no full-length playable audio stream for this track.");
  let lastError:unknown;
  for(const item of playable){
    try{
      const streamUrl=new URL(item.url);
      if(streamUrl.protocol!=="https:"||!/(^|\.)soundcloud\.com$/i.test(streamUrl.hostname))throw new Error("Unexpected SoundCloud stream endpoint.");
      if(track.track_authorization)streamUrl.searchParams.set("track_authorization",String(track.track_authorization));
      streamUrl.searchParams.set("client_id",clientId);
      const response=await fetch(streamUrl.toString(),{headers:{Accept:"application/json"}});
      if(!response.ok)throw new Error("SoundCloud stream authorization failed ("+response.status+").");
      const payload=await response.json() as {url?:unknown};
      if(typeof payload.url!=="string")throw new Error("SoundCloud did not return a playable stream URL.");
      const mediaUrl=new URL(payload.url);
      if(mediaUrl.protocol!=="https:")throw new Error("SoundCloud returned an insecure media URL.");
      const mime=String(item?.format?.mime_type||"audio/mpeg").toLowerCase();
      const expires=mediaUrl.searchParams.get("Expires")||mediaUrl.searchParams.get("expires");
      return {url:mediaUrl.toString(),mimeType:mime,durationMs:duration||undefined,expiresAt:expires&&/^\d+$/.test(expires)?new Date(Number(expires)*1000).toISOString():undefined};
    }catch(error){lastError=error;}
  }
  throw lastError instanceof Error?lastError:new Error("Could not resolve a SoundCloud stream.");
}

export async function resolveYouTubePlayback(videoId:string):Promise<{url:string;mimeType:string;durationMs?:number}>{
  if(!/^[a-zA-Z0-9_-]{11}$/.test(videoId))throw new Error("Invalid YouTube video ID.");
  const profiles=[
    {clientName:"VISIONOS",clientVersion:"1.02",clientIdHeader:"101",origin:"https://www.youtube.com",context:{osName:"visionOS",osVersion:"26.5.23O471",deviceMake:"Apple",deviceModel:"RealityDevice17,1"}},
    {clientName:"ANDROID_VR",clientVersion:"1.65.10",clientIdHeader:"28",origin:"https://www.youtube.com",context:{osName:"Android",osVersion:"12L",deviceMake:"Oculus",deviceModel:"Quest 3",androidSdkVersion:32}}
  ];
  let lastError:unknown;
  for(const profile of profiles){
    try{
      const response=await providerJson(profile.origin+"/youtubei/v1/player?prettyPrint=false",{
        method:"POST",
        headers:{"content-type":"application/json","accept":"application/json","x-youtube-client-name":profile.clientIdHeader,"x-youtube-client-version":profile.clientVersion,"x-origin":profile.origin,"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36"},
        body:JSON.stringify({videoId,contentCheckOk:true,racyCheckOk:true,context:{client:{clientName:profile.clientName,clientVersion:profile.clientVersion,hl:"en",gl:"US",...profile.context},user:{lockedSafetyMode:false}}})
      });
      const status=response?.playabilityStatus?.status;
      if(status!=="OK")throw new Error(response?.playabilityStatus?.reason||"YouTube does not allow playback for this video.");
      const formats=Array.isArray(response?.streamingData?.adaptiveFormats)?response.streamingData.adaptiveFormats:[];
      const audio=formats.filter((item:any)=>typeof item?.url==="string"&&String(item?.mimeType||"").startsWith("audio/")).sort((x:any,y:any)=>(Number(y.bitrate)||0)-(Number(x.bitrate)||0));
      if(!audio.length)throw new Error("YouTube did not return a direct audio stream for this video.");
      const best=audio[0];
      const mediaUrl=new URL(best.url);
       if(mediaUrl.protocol!=="https:"||!/(^|\.)googlevideo\.com$/i.test(mediaUrl.hostname))throw new Error("YouTube returned an unexpected audio URL.");
      return {url:mediaUrl.toString(),mimeType:String(best.mimeType).split(";")[0],durationMs:Number(response?.videoDetails?.lengthSeconds)*1000||undefined};
    }catch(error){lastError=error;}
  }
  throw lastError instanceof Error?lastError:new Error("YouTube audio could not be resolved.");
}

function collectYoutubeVideos(value:any,out:any[]=[],depth=0):any[]{
  if(!value||typeof value!=="object"||depth>24)return out;
  if(!Array.isArray(value)&&value.videoRenderer&&typeof value.videoRenderer.videoId==="string")out.push(value.videoRenderer);
  const children=Array.isArray(value)?value:Object.values(value);
  for(const child of children)collectYoutubeVideos(child,out,depth+1);
  return out;
}
function normalizeMatchText(value:string):string{
  return value.normalize("NFKD").toLocaleLowerCase("en")
    .replace(/\b(official|audio|video|music|lyrics|lyric|visualizer|remastered|hd|4k|topic)\b/g," ")
    .replace(/[^\p{L}\p{N}]/gu,"");
}
function youtubeDuration(value:string):number|undefined{
  const parts=value.split(":").map(Number);
  if(!parts.length||parts.some(part=>!Number.isFinite(part)))return undefined;
  return parts.reduce((total,part)=>total*60+part,0)*1000;
}
export async function resolveYouTubeMatch(title:string,artist:string):Promise<{videoId:string;title:string;artist:string;durationMs?:number}>{
  const wantedTitle=normalizeMatchText(title);
  const wantedArtist=normalizeMatchText(artist.split(/[,;&]|\bfeat\.?\b/i)[0]);
  if(wantedTitle.length<2||wantedArtist.length<2)throw new Error("A song title and artist are required to find a matching YouTube recording.");
  const query=encodeURIComponent(title+" "+artist+" official audio");
  const response=await fetch("https://www.youtube.com/results?search_query="+query,{headers:{accept:"text/html"}});
  if(!response.ok)throw new Error("YouTube search is unavailable right now.");
  const html=await response.text();
  const data=extractEmbeddedJson(html,"ytInitialData")||extractEmbeddedJson(html,'window["ytInitialData"]');
  if(!data)throw new Error("YouTube did not return search results.");
  const candidates=collectYoutubeVideos(data);
  for(const video of candidates){
    const videoId=String(video.videoId||"");
    const candidateTitle=String(video.title?.runs?.map((run:any)=>run.text).join("")||video.title?.simpleText||"");
    const candidateArtist=String(video.ownerText?.runs?.map((run:any)=>run.text).join("")||video.shortBylineText?.runs?.map((run:any)=>run.text).join("")||"");
    const normalizedTitle=normalizeMatchText(candidateTitle);
    const normalizedArtist=normalizeMatchText(candidateArtist);
    if(!/^[a-zA-Z0-9_-]{11}$/.test(videoId))continue;
    const titleMatches=normalizedTitle===wantedTitle||normalizedTitle.includes(wantedTitle);
    const artistMatches=normalizedArtist===wantedArtist||normalizedArtist.includes(wantedArtist)||wantedArtist.includes(normalizedArtist);
    if(titleMatches&&artistMatches){
      const durationText=String(video.lengthText?.simpleText||"");
      return {videoId,title:candidateTitle,artist:candidateArtist,durationMs:youtubeDuration(durationText)};
    }
  }
  throw new Error("LYNE couldn't find a confident YouTube match for that exact song and artist.");
}
