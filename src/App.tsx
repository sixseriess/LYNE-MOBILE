import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import {
  Home, Search, Library, UserRound, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat2,
  Heart, MoreHorizontal, Headphones, Plus, ChevronRight, Music2, Settings, ListMusic,
  Upload, X, Volume2, Maximize2, Minimize2, Clock3, Disc3, Mic2, LogOut, ImagePlus, LayoutGrid, List,
  Download, SlidersHorizontal, Share2, Check, Radio, Music, Sparkles, ArrowLeft, LoaderCircle,
  Link2, ExternalLink, ChevronUp, ChevronDown, Trash2, Pencil, ListPlus
} from "lucide-react";
import { lyneApi, getApiUrl, configureApiUrl, isApiConfigured, type Track, type Playlist, type SearchKind, type SearchPlaylist, type ResolvedImport, type SavedImport } from "./api/client";
import { Home7Fill as WindowsHomeIcon, Search3Fill as WindowsSearchIcon, BookmarksFill as WindowsLibraryIcon, Settings4Fill as WindowsSettingsIcon, AlbumFill, FireFill, TimeFill, TrophyFill } from "@mingcute/react";

type Tab = "Home" | "Search" | "Library" | "Stats" | "Profile";
type Period = "day" | "week" | "month" | "year";
type EqualizerCategory = "enhance" | "genre" | "accent" | "custom";
type EqCustomPreset = { id: string; name: string; gains: number[] };
type EqPreset = { id: string; category: Exclude<EqualizerCategory, "custom">; gains: number[] };
const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_LABELS = ["32", "64", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];
const EQ_PRESETS: EqPreset[] = [
  {id:"hifi",category:"enhance",gains:[2,1.5,.5,0,-.5,0,.5,1.5,2,2.5]},
  {id:"clarity",category:"enhance",gains:[0,0,-.5,-1.5,-1,0,1.5,2,1.5,1]},
  {id:"warmth",category:"enhance",gains:[1.5,2,1.5,.5,0,0,-.5,-1,-1,-1.5]},
  {id:"spacious",category:"enhance",gains:[1,1,0,-1,-1.5,-1,0,1,2,2.5]},
  {id:"headphones",category:"enhance",gains:[2.5,2,1,0,-.5,0,1,1.5,.5,-.5]},
  {id:"laptop",category:"enhance",gains:[-4,-1,2,2.5,1,0,1,1.5,1,0]},
  {id:"night",category:"enhance",gains:[-2,-1.5,-.5,0,.5,1,1,0,-1,-2]},
  {id:"punch",category:"enhance",gains:[1,2,1.5,0,-1.5,-.5,1,1.5,.5,0]},
  {id:"smooth",category:"enhance",gains:[.5,.5,.5,0,0,0,-1,-2,-1,0]},
  {id:"pop",category:"genre",gains:[-1,0,1.5,2.5,2,.5,-.5,0,1,1.5]},
  {id:"rock",category:"genre",gains:[3,2.5,1,-.5,-1,-.5,1,2,2.5,2.5]},
  {id:"hiphop",category:"genre",gains:[4,3.5,1.5,.5,-.5,-.5,.5,0,1,1.5]},
  {id:"electronic",category:"genre",gains:[3.5,3,1,0,-1.5,0,1,1,2.5,3]},
  {id:"jazz",category:"genre",gains:[2,1.5,.5,1,-1,-1,0,1,1.5,2]},
  {id:"classical",category:"genre",gains:[2,1.5,1,.5,0,0,0,1,1.5,2]},
  {id:"acoustic",category:"genre",gains:[1.5,1,1,1.5,.5,.5,1,1.5,1,.5]},
  {id:"rnb",category:"genre",gains:[3,3,1.5,0,-1,0,1,1,1.5,2]},
  {id:"lofi",category:"genre",gains:[1,1.5,2,1,0,-.5,-1.5,-2.5,-4,-6]},
  {id:"bass",category:"accent",gains:[6,5,4,2,0,0,0,0,0,0]},
  {id:"deep_bass",category:"accent",gains:[9,8,5,1,-1,0,0,0,0,0]},
  {id:"less_bass",category:"accent",gains:[-6,-5,-3,-1,0,0,0,0,0,0]},
  {id:"vocal",category:"accent",gains:[-2,-2,-1,0,2,4,4,2,0,-1]},
  {id:"treble",category:"accent",gains:[0,0,0,0,0,0,2,4,5,6]},
  {id:"loudness",category:"accent",gains:[5,4,2,0,-1,0,0,2,4,5]},
];
const EQ_PRESET_LABELS: Record<string,string> = {
  hifi:"Hi-Fi",clarity:"Clarity",warmth:"Warmth",spacious:"Spacious",headphones:"Headphones",
  laptop:"Laptop",night:"Night",punch:"Punch",smooth:"Smooth",pop:"Pop",rock:"Rock",
  hiphop:"Hip-Hop",electronic:"Electronic",jazz:"Jazz",classical:"Classical",acoustic:"Acoustic",
  rnb:"R&B",lofi:"Lo-Fi",bass:"Bass",deep_bass:"Deep Bass",less_bass:"Less Bass",
  vocal:"Vocal",treble:"Treble",loudness:"Loudness"
};
const EQ_PRESET_CATEGORIES: Exclude<EqualizerCategory,"custom">[] = ["enhance","genre","accent"];
const EQ_MAX_CUSTOM_PRESETS = 12;
const EQ_PRESET_NAME_MAX = 24;
const EQ_BAND_Q = 1.4;
const FLAT_EQ = [0,0,0,0,0,0,0,0,0,0];
const clampEqGain = (gain:number) => Math.max(-12,Math.min(12,Math.round(gain*2)/2));
const eqPreampGain = (gains:number[]) => Math.pow(10,(-Math.max(0,...gains))/20);

type PlayRecord = { id: string; title: string; artist: string; ms: number; day: string };
const STORE = "lyne.mobile.v1";
type StoredAudio = { id: string; name: string; file: File; track?: Track };
const AUDIO_DB = "lyne-mobile-audio";
const AUDIO_STORE = "tracks";
function openAudioStore(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(AUDIO_DB,1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(AUDIO_STORE))db.createObjectStore(AUDIO_STORE,{keyPath:"id"});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Device audio storage is unavailable."));
  });
}
async function saveAudioFile(id:string,file:File,track?:Track):Promise<void>{
  const db=await openAudioStore();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(AUDIO_STORE,"readwrite");
    tx.objectStore(AUDIO_STORE).put({id,name:file.name,file,track} satisfies StoredAudio);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error("Could not save this audio file."));
    tx.onabort=()=>reject(tx.error||new Error("Audio file storage was interrupted."));
  }).finally(()=>db.close());
}
async function readAudioFiles():Promise<StoredAudio[]>{
  const db=await openAudioStore();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(AUDIO_STORE,"readonly");
    const request=tx.objectStore(AUDIO_STORE).getAll();
    request.onsuccess=()=>resolve((request.result||[]) as StoredAudio[]);
    request.onerror=()=>reject(request.error||new Error("Could not load saved audio files."));
    tx.oncomplete=()=>db.close();
    tx.onerror=()=>db.close();
  });
}
async function removeAudioFile(id:string):Promise<void>{
  const db=await openAudioStore();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(AUDIO_STORE,"readwrite");
    tx.objectStore(AUDIO_STORE).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error("Could not remove this audio file."));
  }).finally(()=>db.close());
}
const blankState = { likes: [] as string[], playlists: [] as Playlist[], stats: [] as PlayRecord[], history: [] as Track[], importedLikes: [] as SavedImport[], importedCollections: [] as SavedImport[], savedArtists: [] as {id:string;name:string;artwork?:string}[], offlineMixes: [] as {id:string;title:string;artwork?:string;trackIds:string[]}[], profile: { name: "Listener", avatar: "" }, theme: "dark", repeat: "off" as "off"|"all"|"one", preferences: { autoplaySimilar: true, trackTapBehavior: "play" as "play"|"queue", defaultPlaybackContext: "resume" as "resume"|"empty", pauseOnInterruption: true, touchGestures: true, haptics: true, miniPlayer: true, discordPresence: false, youtubeAccountPlayback: false, youtubePromptSignIn: true, youtubeSyncLibrary: false, language: "en" as "en"|"system", reduceMotion: false, cacheLimitMb: 500, audioQuality: "auto" as "auto"|"lossless", lyricsOffsetMs: 0, ambientVisualMode: "soft" as "soft"|"glow"|"off", equalizerEnabled: false, equalizerPreset: "hifi", equalizerCategory: "enhance" as EqualizerCategory, equalizerBands: [...FLAT_EQ] as number[], equalizerCustomPresets: [] as EqCustomPreset[] } };
const providerName = (provider: string) => ({spotify:"Spotify",soundcloud:"SoundCloud",youtube:"YouTube",apple_music:"Apple Music"} as Record<string,string>)[provider] || provider;
const artwork = (track: Track) => track.artwork || "";
function getAudioSourceQuality(track:Track):{label:string;lossless:boolean;format:string}{
  const rawMime=(track.audioMime||"").toLowerCase();
  const mime=rawMime.split(";")[0].trim();
  const url=(track.audioUrl||"").toLowerCase();
  if(mime==="audio/flac"||mime==="audio/x-flac"||/\.flac(?:$|[?#])/.test(url))return {label:"FLAC · Lossless",lossless:true,format:"FLAC"};
  if(mime==="audio/wav"||mime==="audio/x-wav"||mime==="audio/wave"||/\.wav(?:$|[?#])/.test(url))return {label:"WAV · Lossless PCM",lossless:true,format:"WAV"};
  if(mime==="audio/alac"||/codecs\s*=\s*"?alac/i.test(rawMime)||/\.alac(?:$|[?#])/.test(url))return {label:"ALAC · Lossless",lossless:true,format:"ALAC"};
  if(mime==="audio/mpeg"||/\.mp3(?:$|[?#])/.test(url))return {label:"MP3 · Lossy",lossless:false,format:"MP3"};
  if(mime==="audio/aac"||/\.aac(?:$|[?#])/.test(url))return {label:"AAC · Lossy",lossless:false,format:"AAC"};
  if(mime==="audio/opus"||/\.opus(?:$|[?#])/.test(url))return {label:"Opus · Lossy",lossless:false,format:"Opus"};
  if(mime==="audio/mp4"||/\.(m4a|mp4)(?:$|[?#])/.test(url))return {label:"M4A · Codec not verified",lossless:false,format:"M4A"};
  return {label:"Source quality not reported",lossless:false,format:"Unknown"};
}

function rgbToHsl(r:number,g:number,b:number):[number,number,number]{
  r/=255;g/=255;b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  let h=0;const l=(max+min)/2;
  let saturation=0;
  if(delta!==0){
    saturation=delta/(1-Math.abs(2*l-1));
    if(max===r)h=((g-b)/delta)%6;
    else if(max===g)h=(b-r)/delta+2;
    else h=(r-g)/delta+4;
    h/=6;if(h<0)h+=1;
  }
  return [h,saturation,l];
}
function hslToRgb(h:number,saturation:number,l:number):[number,number,number]{
  const c=(1-Math.abs(2*l-1))*saturation;
  const x=c*(1-Math.abs((h*6)%2-1));
  const m=l-c/2;
  let rgb:[number,number,number];
  if(h<1/6)rgb=[c,x,0];
  else if(h<2/6)rgb=[x,c,0];
  else if(h<3/6)rgb=[0,c,x];
  else if(h<4/6)rgb=[0,x,c];
  else if(h<5/6)rgb=[x,0,c];
  else rgb=[c,0,x];
  return rgb.map(value=>Math.round((value+m)*255)) as [number,number,number];
}
type CoverFluidColors={color1:string;color2:string;logoColor:string};
const DEFAULT_COVER_FLUID:CoverFluidColors={color1:"rgb(20,22,28)",color2:"rgb(120,140,175)",logoColor:"rgb(235,242,250)"};
function extractCoverFluidColors(image:HTMLImageElement):CoverFluidColors{
  try{
    const canvas=document.createElement("canvas");canvas.width=48;canvas.height=48;
    const context=canvas.getContext("2d",{willReadFrequently:true});
    if(!context)return DEFAULT_COVER_FLUID;
    context.drawImage(image,0,0,48,48);
    const pixels=context.getImageData(0,0,48,48).data;
    const buckets=Array.from({length:12},()=>({count:0,sSum:0,hSum:0}));
    let total=0,coloured=0;
    const darkSum=[0,0,0],brightSum=[0,0,0];let darkCount=0,brightCount=0;
    for(let i=0;i<pixels.length;i+=4){
      if(pixels[i+3]<128)continue;
      const red=pixels[i],green=pixels[i+1],blue=pixels[i+2];
      const [h,s,l]=rgbToHsl(red,green,blue);total++;
      if(l<.25){darkSum[0]+=red;darkSum[1]+=green;darkSum[2]+=blue;darkCount++;}
      else if(l>.65){brightSum[0]+=red;brightSum[1]+=green;brightSum[2]+=blue;brightCount++;}
      if(s>=.16&&l>=.12&&l<=.88){const bucket=buckets[Math.min(11,Math.floor(h*12))];bucket.count++;bucket.sSum+=s;bucket.hSum+=h;coloured++;}
    }
    if(total===0)return DEFAULT_COVER_FLUID;
    if(coloured/total<.05){
      const dark=darkCount>0?darkSum.map(v=>Math.min(Math.round(v/darkCount),30)):[18,20,24];
      const bright=brightCount>0?brightSum.map(v=>Math.max(Math.round(v/brightCount),180)):[190,200,215];
      return {color1:`rgb(${dark.join(", ")})`,color2:`rgb(${bright.join(", ")})`,logoColor:"rgb(235,242,250)"};
    }
    const findBest=(exclude=-1,minRatio=0)=>{
      let best=-1,score=-1;
      const threshold=exclude>=0&&minRatio>0?buckets[exclude].count*minRatio:0;
      for(let i=0;i<buckets.length;i++){
        if(i===exclude)continue;
        const b=buckets[i];if(!b.count||b.count<threshold)continue;
        if(exclude>=0){const diff=Math.abs(i-exclude);if(Math.min(diff,buckets.length-diff)<2)continue;}
        const candidate=b.count*(.3+(b.sSum/b.count)*.7);
        if(candidate>score){score=candidate;best=i;}
      }
      return best;
    };
    const best=findBest();if(best<0)return DEFAULT_COVER_FLUID;
    const dominant=buckets[best],h=dominant.hSum/dominant.count,s=dominant.sSum/dominant.count;
    const bright=hslToRgb(h,Math.min(s*1.15,.95),.52);
    const logo=hslToRgb(h,Math.min(s*.7,.45),.88);
    const second=findBest(best,.2);
    const dark=second!==-1
      ? hslToRgb(buckets[second].hSum/buckets[second].count,Math.max((buckets[second].sSum/buckets[second].count)*.85,.35),.24)
      : hslToRgb(h,Math.max(s*.9,.35),.24);
    return {color1:`rgb(${dark.join(", ")})`,color2:`rgb(${bright.join(", ")})`,logoColor:`rgb(${logo.join(", ")})`};
  }catch{return DEFAULT_COVER_FLUID;}
}

function extractCoverAccent(image:HTMLImageElement):string{
  const match=extractCoverFluidColors(image).color2.match(/\d+\s*,\s*\d+\s*,\s*\d+/);
  return match?.[0]||"200,245,106";
}

const fmtTime = (ms: number) => { const s=Math.max(0,Math.floor(ms/1000)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; };
type LyricLine = { timeMs:number; text:string };
function parseSyncedLyrics(raw:string):LyricLine[]{
  const output:LyricLine[]=[];
  const stamp=/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for(const line of raw.split(/\r?\n/)){
    const matches=[...line.matchAll(stamp)];
    const text=line.replace(stamp,"").trim();
    if(!text)continue;
    for(const match of matches){const fraction=match[3]||"0";const millis=Number(fraction.padEnd(3,"0").slice(0,3));output.push({timeMs:Number(match[1])*60000+Number(match[2])*1000+millis,text});}
  }
  return output.sort((a,b)=>a.timeMs-b.timeMs);
}
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
async function resizePlaylistImage(file: File): Promise<string> { const bitmap = await createImageBitmap(file); const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); const context = canvas.getContext("2d"); if (!context) { bitmap.close(); throw new Error("Could not process that image."); } context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return canvas.toDataURL("image/jpeg", 0.82); }
async function resizeBackgroundImage(file: File): Promise<string> { const bitmap=await createImageBitmap(file); const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)); const canvas=document.createElement("canvas"); canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale)); const context=canvas.getContext("2d"); if(!context){bitmap.close();throw new Error("Could not process that background.");} context.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close(); return canvas.toDataURL("image/jpeg",0.82); }
function dataUrlToFile(value:string,name:string):File{const match=/^data:([^;,]+);base64,(.+)$/.exec(value);if(!match)throw new Error("Invalid saved playlist artwork.");const bytes=Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0));return new File([bytes],name,{type:match[1]});}
function mergeLocalCollectionTracks(remote:SavedImport[],local:SavedImport[]):SavedImport[]{
  const merged=remote.map(item=>{
    const previous=local.find(old=>old.provider===item.provider&&old.providerId===item.providerId&&old.kind===item.kind);
    return previous?.addedTracks?.length?{...item,addedTracks:previous.addedTracks}:item;
  });
  for(const item of local){
    if(!merged.some(existing=>existing.provider===item.provider&&existing.providerId===item.providerId&&existing.kind===item.kind))merged.push(item);
  }
  return merged;
}
async function syncPendingPlaylists(items: Playlist[]): Promise<Playlist[]> {
  return Promise.all(items.map(async playlist=>{
    if(playlist.synced)return playlist;
    try{
      const remote=await lyneApi.createPlaylist(playlist.name,playlist.description||"");
      let synced={...playlist,id:remote.id,synced:true};
      if(playlist.cover?.startsWith("data:")){try{const artworkFile=dataUrlToFile(playlist.cover,"playlist-artwork.jpg");const uploaded=await lyneApi.uploadPlaylistCover(remote.id,artworkFile);synced={...synced,cover:uploaded.cover};}catch{}}
      await lyneApi.updatePlaylist(synced);
      return synced;
    }catch{return playlist;}
  }));
}
function loadState(): typeof blankState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "{}") as Partial<typeof blankState>;
    return { ...blankState, ...saved, profile: { ...blankState.profile, ...saved.profile }, preferences: { ...blankState.preferences, ...saved.preferences } };
  } catch { return blankState; }
}
function Cover({ track, className = "" }: { track?: Track; className?: string }) {
  return <div className={`cover ${className}`} style={artwork(track || {} as Track) ? { backgroundImage: `url("${artwork(track!)}")` } : undefined}>{!artwork(track || {} as Track) && <Music2 size={22}/>}</div>;
}
function Row({ track, active, liked, onPlay, onLike, onMore }: { track: Track; active: boolean; liked: boolean; onPlay:()=>void; onLike:()=>void; onMore:()=>void }) {
  return <div className={`track-row ${active?"is-active":""}`}><button className="track-main" onClick={onPlay}><Cover track={track}/><span className="track-copy"><b>{track.title}</b><small>{track.artist}{track.explicit?" · E":""}</small></span></button><button className={`plain-icon ${liked?"liked":""}`} aria-label="Like song" onClick={onLike}><Heart size={18} fill={liked?"currentColor":"none"}/></button><button className="plain-icon" aria-label={`More options for ${track.title}`} onClick={onMore}><MoreHorizontal size={19}/></button></div>;
}

function MixArtwork({artworkUrl,number}:{artworkUrl?:string;number:number}){
  const [colors,setColors]=useState<CoverFluidColors>(DEFAULT_COVER_FLUID);
  useEffect(()=>{
    if(!artworkUrl){setColors(DEFAULT_COVER_FLUID);return;}
    let active=true;
    const image=new Image();image.crossOrigin="anonymous";
    image.onload=()=>{if(active)setColors(extractCoverFluidColors(image));};
    image.onerror=()=>{if(active)setColors(DEFAULT_COVER_FLUID);};
    image.src=artworkUrl;
    return ()=>{active=false;image.onload=null;image.onerror=null;};
  },[artworkUrl]);
  return <div className="mix-artwork" style={{backgroundImage:artworkUrl?`linear-gradient(45deg,${colors.color1} 0%,rgba(0,0,0,.2) 100%),url("${artworkUrl}")`:`linear-gradient(45deg,${colors.color1} 0%,rgba(0,0,0,.2) 100%)`}}>
    <svg viewBox="0 0 80 28" className="mix-artwork-logo" style={{fill:colors.logoColor}} aria-hidden="true">
      <text x="0" y="22" fontFamily="Arial, Helvetica, sans-serif" fontSize="24" fontWeight="800" letterSpacing="-1.5">LYNE</text>
    </svg>
    <span className="mix-artwork-word">MIX</span>
    <span className="mix-artwork-number">{String(number).padStart(2,"0")}</span>
  </div>;
}

export default function App() {
  const [tab,setTab]=useState<Tab>("Home");
  const [state,setState]=useState(loadState);
  const [current,setCurrent]=useState<Track|null>(()=>{try{const preferences=JSON.parse(localStorage.getItem(STORE)||"{}").preferences;return preferences?.defaultPlaybackContext==="empty"?null:JSON.parse(localStorage.getItem("lyne.mobile.current")||"null");}catch{return null;}});
  const [queue,setQueue]=useState<Track[]>(()=>{try{return JSON.parse(localStorage.getItem("lyne.mobile.queue")||"[]") as Track[];}catch{return [];}});
  const [playing,setPlaying]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(0);
  const [volume,setVolume]=useState(()=>{const saved=localStorage.getItem("lyne.mobile.volume");const value=saved===null?0.8:Number(saved);return Number.isFinite(value)?Math.max(0,Math.min(1,value)):0.8;});
  const [playbackRate,setPlaybackRate]=useState(()=>{const saved=localStorage.getItem("lyne.mobile.playbackRate");const value=saved===null?1:Number(saved);return Number.isFinite(value)&&value>=0.5&&value<=2?value:1;});
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<SearchKind>("all");
  const [results,setResults]=useState<Track[]>([]);
  const [playlistResults,setPlaylistResults]=useState<SearchPlaylist[]>([]);
  const [publicPlaylistDetail,setPublicPlaylistDetail]=useState<{playlist:SearchPlaylist&{trackIds:string[]};tracks:Track[]}|null>(null);
  const [offlineBusy,setOfflineBusy]=useState(false);
  const [offlineMixId,setOfflineMixId]=useState<string|null>(null);
  const [searchError,setSearchError]=useState("");
  const [artistResults,setArtistResults]=useState<{id:string;name:string;bio?:string;artwork?:string}[]>([]);
  const [albumResults,setAlbumResults]=useState<{id:string;title:string;artist:string;artistId:string;artwork?:string}[]>([]);
  const [artistDetail,setArtistDetail]=useState<{artist:{id:string;name:string;bio?:string;artwork?:string;verified?:boolean;monthlyListeners?:string;followers?:number};tracks:Track[];albums:{id:string;title:string;releaseDate?:string;artwork?:string}[]}|null>(null);
  const [albumDetail,setAlbumDetail]=useState<{album:{id:string;title:string;artist:string;artistId:string;releaseDate?:string;artwork?:string};tracks:Track[]}|null>(null);
  const [detailBusy,setDetailBusy]=useState(false);
  const [detailError,setDetailError]=useState("");
  const detailRetryRef=useRef<(()=>void)|null>(null);
  const [apiStatus,setApiStatus]=useState<"checking"|"online"|"offline">("checking");
  const [networkOnline,setNetworkOnline]=useState(()=>typeof navigator==="undefined"?true:navigator.onLine);
  const [apiMessage,setApiMessage]=useState("");
  const [apiUrlInput,setApiUrlInput]=useState(getApiUrl());
  const [apiTesting,setApiTesting]=useState(false);
  const [homeTracks,setHomeTracks]=useState<Track[]>([]);
  const [listeningNowTracks,setListeningNowTracks]=useState<Track[]>([]);
  const [homeMixes,setHomeMixes]=useState<{id:string;title:string;artwork?:string;tracks:Track[]}[]>([]);
  const [popularAlbums,setPopularAlbums]=useState<{id:string;title:string;artist:string;artistId:string;releaseDate?:string;artwork?:string;trackCount?:number}[]>([]);
  const [homeLoading,setHomeLoading]=useState(false);
  const [homeError,setHomeError]=useState("");
  const [loadingSearch,setLoadingSearch]=useState(false);
  const [modal,setModal]=useState<"playlist"|"playlistDetail"|"publicPlaylistDetail"|"track"|"artistDetail"|"albumDetail"|"account"|"profileEdit"|"settings"|"queue"|"lyrics"|"equalizer"|"import"|"collection"|null>(null);
  const modalDialogRef=useRef<HTMLDivElement|null>(null);
  const modalCloseRef=useRef<HTMLButtonElement|null>(null);
  const [importUrl,setImportUrl]=useState("");
  const [importPreview,setImportPreview]=useState<ResolvedImport|null>(null);
  const [importError,setImportError]=useState("");
  const [importBusy,setImportBusy]=useState(false);
  const [importSaving,setImportSaving]=useState(false);
  const [activeCollection,setActiveCollection]=useState<SavedImport|null>(null);
  const [playlistName,setPlaylistName]=useState("");
  const [selectedPlaylistId,setSelectedPlaylistId]=useState<string|null>(null);
  const [editPlaylistName,setEditPlaylistName]=useState("");
  const [editPlaylistDescription,setEditPlaylistDescription]=useState("");
  const [activeTrack,setActiveTrack]=useState<Track|null>(null);
  const [localMetaEdit,setLocalMetaEdit]=useState<{id:string;title:string;artist:string;album:string;artwork:string}>();
  const localArtworkRef=useRef<HTMLInputElement|null>(null);
  const playlistCoverRef=useRef<HTMLInputElement|null>(null);
  const [accountName,setAccountName]=useState("");
  const [editUsername,setEditUsername]=useState("");
  const [profileUpdateBusy,setProfileUpdateBusy]=useState(false);
  const [accountEmail,setAccountEmail]=useState("");
  const [accountPassword,setAccountPassword]=useState("");
  const [accountMode,setAccountMode]=useState<"login"|"register">("login");
  const [accountMessage,setAccountMessage]=useState("");
  const [user,setUser]=useState<{id:string;username:string}|null>(null);
  const [guestMode,setGuestMode]=useState(false);
  const [accountSyncReady,setAccountSyncReady]=useState(false);
  const [accountBusy,setAccountBusy]=useState(false);
  const [period,setPeriod]=useState<Period>("week");
  const [wrappedOpen,setWrappedOpen]=useState(false);
  const [localTracks,setLocalTracks]=useState<Track[]>([]);
  const [shuffle,setShuffle]=useState(()=>localStorage.getItem("lyne.mobile.shuffle")==="true");
  const [notice,setNotice]=useState("");
  const [settingsSection,setSettingsSection]=useState<"Profile"|"Playback"|"Listening"|"Shortcuts"|"Appearance"|"Overlay"|"Connections"|"YouTube"|"Discord"|"Storage"|"About">("Appearance");
  const [providerStatus,setProviderStatus]=useState<Record<string,{configured:boolean;capability:string}>|null>(null);
  const [providerStatusError,setProviderStatusError]=useState("");
  const loadProviderStatus=async()=>{try{const result=await lyneApi.providerStatus();setProviderStatus(result.providers);setProviderStatusError("");}catch(error){setProviderStatusError(error instanceof Error?error.message:"Could not check provider connections.");}};
  const [storageUsed,setStorageUsed]=useState<number|null>(null);
  const [ambientColor,setAmbientColor]=useState("200,245,106");
  const [equalizerError,setEqualizerError]=useState("");
  const [equalizerTab,setEqualizerTab]=useState<EqualizerCategory>(()=>state.preferences.equalizerCategory);
  const [equalizerPresetName,setEqualizerPresetName]=useState("");
  const audioContextRef=useRef<AudioContext|null>(null);
  const equalizerSourceRef=useRef<MediaElementAudioSourceNode|null>(null);
  const equalizerPreampRef=useRef<GainNode|null>(null);
  const equalizerFiltersRef=useRef<BiquadFilterNode[]>([]);
  const playerTouchStart=useRef<{x:number;y:number}|null>(null);
  const haptic=useCallback(()=>{if(state.preferences.haptics&&typeof navigator!=="undefined"&&typeof navigator.vibrate==="function")navigator.vibrate(8);},[state.preferences.haptics]);
  const ensureEqualizerGraph=useCallback(async()=>{
    const audio=audioRef.current;
    if(!audio)throw new Error("Start a track before enabling the equalizer.");
    const AudioContextConstructor=window.AudioContext||(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!AudioContextConstructor)throw new Error("This browser does not support audio equalizer processing.");
    if(!audioContextRef.current){
      const context=new AudioContextConstructor();
      try{
        audio.crossOrigin="anonymous";
        const source=context.createMediaElementSource(audio);
        const preamp=context.createGain();
        preamp.gain.value=1;
        const filters=EQ_FREQUENCIES.map((frequency,index)=>{
          const filter=context.createBiquadFilter();
          filter.type=index===0?"lowshelf":index===EQ_FREQUENCIES.length-1?"highshelf":"peaking";
          filter.frequency.value=frequency;
          filter.Q.value=EQ_BAND_Q;
          filter.gain.value=0;
          return filter;
        });
        source.connect(preamp);
        preamp.connect(filters[0]);
        filters.slice(1).forEach((filter,index)=>filters[index].connect(filter));
        filters[filters.length-1].connect(context.destination);
        equalizerSourceRef.current=source;
        equalizerPreampRef.current=preamp;
        equalizerFiltersRef.current=filters;
        audioContextRef.current=context;
      }catch(error){
        await context.close().catch(()=>{});
        throw error instanceof Error?error:new Error("Could not initialize the equalizer.");
      }
    }
    const context=audioContextRef.current;
    if(context.state==="suspended")await context.resume();
    equalizerFiltersRef.current.forEach((filter,index)=>{
      const value=state.preferences.equalizerEnabled?Number(state.preferences.equalizerBands[index]||0):0;
      filter.gain.setTargetAtTime(value,context.currentTime,0.035);
    });
  },[state.preferences.equalizerEnabled,state.preferences.equalizerBands]);
  const toggleEqualizer=useCallback(async(enabled:boolean)=>{
    if(enabled){
      try{
        await ensureEqualizerGraph();
        setEqualizerError("");
        setState(old=>({...old,preferences:{...old.preferences,equalizerEnabled:true}}));
        setNotice("Equalizer enabled.");
      }catch(error){
        const message=error instanceof Error?error.message:"Equalizer could not be enabled.";
        setEqualizerError(message);
        setNotice(message);
      }
    }else{
      equalizerFiltersRef.current.forEach(filter=>{
        const context=audioContextRef.current;
        if(context)filter.gain.setTargetAtTime(0,context.currentTime,0.035);
      });
      setState(old=>({...old,preferences:{...old.preferences,equalizerEnabled:false}}));
      setEqualizerError("");
    }
  },[ensureEqualizerGraph]);
  const applyEqualizerGains=(gains:number[],presetId:string,category:EqualizerCategory)=>{
    const normalized=gains.map(clampEqGain);
    setState(old=>({...old,preferences:{...old.preferences,equalizerEnabled:true,equalizerPreset:presetId,equalizerCategory:category,equalizerBands:normalized}}));
    const context=audioContextRef.current;
    if(context){
      equalizerFiltersRef.current.forEach((filter,index)=>filter.gain.setTargetAtTime(normalized[index]??0,context.currentTime,0.02));
      if(equalizerPreampRef.current)equalizerPreampRef.current.gain.setTargetAtTime(eqPreampGain(normalized),context.currentTime,0.02);
    }else if(audioRef.current?.src){
      void ensureEqualizerGraph().catch(error=>setEqualizerError(error instanceof Error?error.message:"Equalizer could not be enabled."));
    }
  };
  const setEqualizerPreset=(preset:EqPreset)=>{
    setEqualizerTab(preset.category);
    setEqualizerError("");
    applyEqualizerGains(preset.gains,preset.id,preset.category);
  };
  const saveEqualizerPreset=()=>{
    const name=equalizerPresetName.trim().slice(0,EQ_PRESET_NAME_MAX);
    if(!name){setEqualizerError("Enter a name for this preset.");return;}
    if(state.preferences.equalizerCustomPresets.length>=EQ_MAX_CUSTOM_PRESETS){setEqualizerError("You can save up to 12 custom presets.");return;}
    const preset:EqCustomPreset={id:`custom-${Date.now()}`,name,gains:state.preferences.equalizerBands.map(clampEqGain)};
    setState(old=>({...old,preferences:{...old.preferences,equalizerCustomPresets:[...old.preferences.equalizerCustomPresets,preset],equalizerPreset:preset.id,equalizerCategory:"custom"}}));
    setEqualizerTab("custom");
    setEqualizerPresetName("");
    setEqualizerError("");
  };
  const deleteEqualizerPreset=(id:string)=>{
    setState(old=>({...old,preferences:{...old.preferences,equalizerCustomPresets:old.preferences.equalizerCustomPresets.filter(preset=>preset.id!==id),...(old.preferences.equalizerPreset===id?{equalizerPreset:"custom"}:{})}}));
  };
  const [customBackground,setCustomBackground]=useState(()=>localStorage.getItem("lyne.mobile.background")||"");
  const backgroundFileRef=useRef<HTMLInputElement|null>(null);
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const fileRef=useRef<HTMLInputElement|null>(null);
  const currentRef=useRef<Track|null>(null);
  const listeningReportedRef=useRef<string|null>(null);

  useEffect(()=>{ localStorage.setItem(STORE,JSON.stringify(state)); },[state]);
  useEffect(()=>{
    const media=window.matchMedia("(prefers-color-scheme: dark)");
    const apply=()=>{document.documentElement.dataset.theme=state.theme==="system"?(media.matches?"dark":"light"):state.theme;};
    apply();
    media.addEventListener?.("change",apply);
    return ()=>media.removeEventListener?.("change",apply);
  },[state.theme]);
  useEffect(()=>{
    document.documentElement.dataset.reducedMotion=state.preferences.reduceMotion?"true":"false";
  },[state.preferences.reduceMotion]);
  useEffect(()=>{
    const artworkUrl=current?.artwork;
    if(!artworkUrl||state.preferences.ambientVisualMode==="off"){setAmbientColor("200,245,106");return;}
    let active=true;
    const image=new Image();
    image.crossOrigin="anonymous";
    image.onload=()=>{
      if(!active)return;
      try{setAmbientColor(extractCoverAccent(image));}
      catch{setAmbientColor("200,245,106");}
    };
    image.onerror=()=>{if(active)setAmbientColor("200,245,106");};
    image.src=artworkUrl;
    return ()=>{active=false;image.onload=null;image.onerror=null;};
  },[current?.artwork,state.preferences.ambientVisualMode]);
  useEffect(()=>{
    const root=document.documentElement;
    const cover=current?.artwork||homeTracks[0]?.artwork||popularAlbums[0]?.artwork||"";
    if(cover)root.style.setProperty("--current-artwork",`url("${cover}")`);
    else root.style.removeProperty("--current-artwork");
    return ()=>{root.style.removeProperty("--current-artwork");};
  },[current?.artwork,homeTracks[0]?.artwork,popularAlbums[0]?.artwork]);
  useEffect(()=>{
    const [red,green,blue]=ambientColor.split(",").map(value=>Math.max(0,Math.min(255,Number(value)||0)));
    const root=document.documentElement;
    root.style.setProperty("--lime-rgb",`${red},${green},${blue}`);
    root.style.setProperty("--lime",`rgb(${red} ${green} ${blue})`);
    root.style.setProperty("--lime-soft",`rgba(${red}, ${green}, ${blue}, .14)`);
    root.style.setProperty("--artwork-glow",`rgba(${red}, ${green}, ${blue}, .22)`);
  },[ambientColor]);
  useEffect(()=>{
    const update=()=>setNetworkOnline(navigator.onLine);
    window.addEventListener("online",update);
    window.addEventListener("offline",update);
    return ()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);};
  },[]);
  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;
    let refreshing=false;
    const onControllerChange=()=>{
      if(refreshing||!navigator.serviceWorker.controller)return;
      refreshing=true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange",onControllerChange);
    void navigator.serviceWorker.ready.then(registration=>registration.update()).catch(()=>{});
    return ()=>navigator.serviceWorker.removeEventListener("controllerchange",onControllerChange);
  },[]);
  useEffect(()=>{
    if(!modal)return;
    const previouslyFocused=document.activeElement instanceof HTMLElement?document.activeElement:null;
    modalCloseRef.current?.focus();
    const handleKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setModal(null);return;}
      if(event.key!=="Tab")return;
      const focusable=modalDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if(!focusable?.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",handleKeyDown);
    return ()=>{
      document.removeEventListener("keydown",handleKeyDown);
      previouslyFocused?.focus();
    };
  },[modal]);
  useEffect(()=>{
    if(!user||!accountSyncReady)return;
    const timer=window.setTimeout(()=>{void lyneApi.savePreferences({...state.preferences,theme:state.theme}).catch(()=>setNotice("Your settings are saved on this device; account sync will retry when LYNE is available."));},900);
    return ()=>window.clearTimeout(timer);
  },[user?.id,accountSyncReady,state.preferences,state.theme]);
  useEffect(()=>{ currentRef.current=current; if(current&&current.source!=="local")localStorage.setItem("lyne.mobile.current",JSON.stringify(current));else localStorage.removeItem("lyne.mobile.current"); },[current]);
  useEffect(()=>{try{localStorage.setItem("lyne.mobile.queue",JSON.stringify(queue.filter(track=>track.source!=="local").slice(0,100)));}catch{}},[queue]);
  useEffect(()=>{
    const token=localStorage.getItem("lyne.accessToken");
    if(!token)return;
    let active=true;
    void lyneApi.me().then(async profile=>{
      if(!active)return;
      setUser({id:profile.id,username:profile.username});
      setGuestMode(false);
      const [remote,imports,history,preferences]=await Promise.allSettled([lyneApi.playlists(),lyneApi.getImports(),lyneApi.listeningHistory(),lyneApi.preferences()]);
      if(!active)return;
      let mergedPlaylists=state.playlists;
      if(remote.status==="fulfilled"){
        const remotePlaylists=remote.value.playlists.map(item=>({...item,synced:true}));
        const syncedLocal=await syncPendingPlaylists(state.playlists);
        mergedPlaylists=[...remotePlaylists,...syncedLocal.filter(item=>!remotePlaylists.some(remoteItem=>remoteItem.id===item.id))];
      }
      setState(old=>({...old,
        profile:{...old.profile,name:profile.username,avatar:profile.avatar||old.profile.avatar},
        playlists:mergedPlaylists,
        importedLikes:imports.status==="fulfilled"?(imports.value.likes||[]):old.importedLikes,
        importedCollections:imports.status==="fulfilled"?mergeLocalCollectionTracks(imports.value.collections||[],old.importedCollections):old.importedCollections,
        stats:history.status==="fulfilled"?(history.value.stats||[]):old.stats,
        preferences:preferences.status==="fulfilled"?({...old.preferences,...preferences.value.preferences} as typeof old.preferences):old.preferences,
        theme:preferences.status==="fulfilled"&&["dark","light","system"].includes(String(preferences.value.preferences.theme))?String(preferences.value.preferences.theme):old.theme
      }));
      setAccountSyncReady(true);
      if(remote.status==="rejected"||imports.status==="rejected"||history.status==="rejected"||preferences.status==="rejected")setNotice("You're signed in. Some library or listening data couldn't sync yet; LYNE will keep your local data.");
    }).catch(error=>{
      if(!active)return;
      const status=(error as {status?:number})?.status;
      if(status===401||status===403){
        setAccountSyncReady(false);
        localStorage.removeItem("lyne.accessToken");
        setUser(null);
        setGuestMode(true);
        setNotice("Your LYNE session expired. Sign in again to sync your account.");
      }else{
        setGuestMode(true);
        setNotice("LYNE couldn't verify your saved session right now. Your sign-in is kept; check your connection and reopen LYNE to retry.");
      }
    });
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{
    let cancelled=false;
    const urls:string[]=[];
    void readAudioFiles().then(entries=>{
      if(cancelled)return;
      const restored=entries.map(entry=>{
        const audioUrl=URL.createObjectURL(entry.file); urls.push(audioUrl);
        return entry.track?{...entry.track,audioUrl,audioMime:entry.file.type||entry.track.audioMime,audioSize:entry.file.size,offline:true}:{id:entry.id,title:entry.name.replace(/\.[^.]+$/,""),artist:"Local file",audioUrl,audioMime:entry.file.type,audioSize:entry.file.size,durationMs:0,source:"local" as const};
      });
      setLocalTracks(restored);
      setCurrent(previous=>previous?restored.find(track=>track.id===previous.id)||previous:previous);
      setQueue(previous=>previous.map(track=>restored.find(saved=>saved.id===track.id)||track));
    }).catch(()=>{if(!cancelled)setNotice("Saved device audio could not be restored in this browser.");});
    return ()=>{cancelled=true;urls.forEach(url=>URL.revokeObjectURL(url));};
  },[]);
  useEffect(()=>{ let live=true; if(!isApiConfigured()){setApiStatus("offline");setApiMessage("API URL not configured. Deploy the LYNE Worker, then paste its URL in Settings → About.");return ()=>{live=false;};} lyneApi.health().then(()=>{if(live){setApiStatus("online");setApiMessage("");}}).catch(e=>{if(live){setApiStatus("offline");setApiMessage(e.message);}}); return ()=>{live=false;}; },[]);
  const loadHome=useCallback(async()=>{
    setHomeLoading(true);setHomeError("");
    try{
      const data=await lyneApi.home();
      setHomeTracks([...(data.recentlyPlayed||[]),...(data.popular||[])]);
      setListeningNowTracks(data.listeningNow||[]);
      setHomeMixes(data.mixes||[]);
      setPopularAlbums(data.popularAlbums||[]);
    }catch(error){
      setHomeError(error instanceof Error?error.message:"LYNE Home could not be loaded.");
    }finally{setHomeLoading(false);}
  },[]);
  useEffect(()=>{if(apiStatus==="online")void loadHome();},[apiStatus,loadHome]);
  useEffect(()=>{ if(!current?.audioUrl){ if(audioRef.current)audioRef.current.pause(); return; } const audio=audioRef.current; if(!audio)return; audio.crossOrigin="anonymous"; audio.src=current.audioUrl; audio.volume=volume; if(playing)void audio.play().catch(()=>{setPlaying(false);setNotice("This track couldn't be played.");}); },[current?.id,current?.audioUrl]);
  useEffect(()=>{ if(audioRef.current){audioRef.current.volume=volume;if(playing)void audioRef.current.play().catch(()=>setPlaying(false));else audioRef.current.pause();} },[playing,volume]);
  useEffect(()=>{localStorage.setItem("lyne.mobile.volume",String(volume));},[volume]);
  useEffect(()=>{localStorage.setItem("lyne.mobile.playbackRate",String(playbackRate));},[playbackRate]);
  useEffect(()=>{localStorage.setItem("lyne.mobile.shuffle",String(shuffle));},[shuffle]);
  useEffect(()=>{
    const context=audioContextRef.current;
    if(!context||!equalizerFiltersRef.current.length)return;
    const enabled=state.preferences.equalizerEnabled;
    const gains=state.preferences.equalizerBands;
    equalizerFiltersRef.current.forEach((filter,index)=>{
      filter.gain.setTargetAtTime(enabled?Number(gains[index]||0):0,context.currentTime,0.02);
    });
    if(equalizerPreampRef.current)equalizerPreampRef.current.gain.setTargetAtTime(enabled?eqPreampGain(gains):1,context.currentTime,0.02);
  },[state.preferences.equalizerEnabled,state.preferences.equalizerBands]);
  useEffect(()=>{if(audioRef.current)audioRef.current.playbackRate=playbackRate;},[playbackRate,current?.id]);
  useEffect(()=>{ if(!playing||!current)return; const timer=window.setInterval(()=>{ const audio=audioRef.current; if(audio){setPosition(audio.currentTime*1000);setDuration(Number.isFinite(audio.duration)?audio.duration*1000:0);} },500); return ()=>window.clearInterval(timer); },[playing,current?.id]);
  useEffect(()=>{ if(!playing||!current)return; const timer=window.setInterval(()=>{setState(s=>{const key=dayKey();const old=s.stats.find(x=>x.id===current.id&&x.day===key);const item={id:current.id,title:current.title,artist:current.artist,ms:(old?.ms||0)+1000,day:key};return {...s,stats:old?s.stats.map(x=>x===old?item:x):[...s.stats,item]};});},1000);return()=>window.clearInterval(timer); },[playing,current?.id]);
  const reportListening=useCallback((track:Track|null,listenedMs:number)=>{
    if(!user||!track||track.source==="local"||listenedMs<1000||listeningReportedRef.current===track.id)return;
    listeningReportedRef.current=track.id;
    void lyneApi.listening({trackId:track.id,listenedMs:Math.min(3600000,Math.floor(listenedMs)),playedAt:new Date().toISOString()}).catch(()=>{listeningReportedRef.current=null;});
  },[user]);
  const play = useCallback((track:Track,list:Track[] = [])=>{
    haptic();
    const selected=localTracks.find(item=>item.id===track.id&&item.offline)||track;
    const selectedList=list.map(item=>localTracks.find(saved=>saved.id===item.id&&saved.offline)||item);
    if(current&&current.id!==selected.id)reportListening(current,position);
    listeningReportedRef.current=null;
    const quality=getAudioSourceQuality(selected);
    if(state.preferences.audioQuality==="lossless"&&!quality.lossless){
      setNotice("Lossless only is enabled. "+quality.label+". Choose Auto or use a FLAC, WAV or ALAC source.");
      return;
    }
    setCurrent(selected);
    setQueue(selectedList.length?selectedList:[selected]);
    setPlaying(true);setExpanded(false);
    setState(old=>({...old,history:[selected,...old.history.filter(t=>t.id!==selected.id)].slice(0,50)}));
  },[state.preferences.audioQuality,current,position,reportListening,localTracks,haptic]);
  const toggleLike=(track:Track)=>{haptic();setState(s=>({...s,likes:s.likes.includes(track.id)?s.likes.filter(id=>id!==track.id):[...s.likes,track.id]}));};
  const next=()=>{
    haptic();
    if(!queue.length){setPlaying(false);return;}
    const idx=queue.findIndex(t=>t.id===current?.id);
    if(shuffle){const choices=queue.filter(t=>t.id!==current?.id);const target=choices[Math.floor(Math.random()*choices.length)];if(target){play(target,queue);return;}}
    if(idx>=0&&idx<queue.length-1){play(queue[idx+1],queue);return;}
    if(state.repeat==="all"&&queue.length){play(queue[0],queue);return;}
    if(state.preferences.autoplaySimilar){const played=new Set(queue.map(t=>t.id));const candidates=homeTracks.filter(t=>!played.has(t.id));const target=candidates[0]||homeTracks.find(t=>t.id!==current?.id);if(target){play(target,[...queue,target]);return;}}
    setPlaying(false);
  };
  const previous=()=>{
    haptic();
    if(position>3000){if(audioRef.current)audioRef.current.currentTime=0;setPosition(0);return;}
    const idx=queue.findIndex(t=>t.id===current?.id);
    if(idx>0){play(queue[idx-1],queue);return;}
    if(state.repeat==="all"&&queue.length){play(queue[queue.length-1],queue);return;}
    if(current&&audioRef.current){audioRef.current.currentTime=0;setPosition(0);}
  };
  const moveQueueTrack=(trackId:string,direction:-1|1)=>{
    setQueue(items=>{
      const from=items.findIndex(item=>item.id===trackId),to=from+direction;
      if(from<0||to<0||to>=items.length)return items;
      const reordered=[...items];[reordered[from],reordered[to]]=[reordered[to],reordered[from]];
      return reordered;
    });
  };
  const removeQueueTrack=(trackId:string)=>{
    if(current?.id===trackId){setNotice("The currently playing song stays in your queue.");return;}
    setQueue(items=>items.filter(item=>item.id!==trackId));
  };
  const handlePlayerTouchStart=(event:ReactTouchEvent<HTMLDivElement>)=>{
    if(!state.preferences.touchGestures)return;
    const touch=event.changedTouches[0];
    playerTouchStart.current={x:touch.clientX,y:touch.clientY};
  };
  const handlePlayerTouchEnd=(event:ReactTouchEvent<HTMLDivElement>)=>{
    const start=playerTouchStart.current;
    playerTouchStart.current=null;
    if(!state.preferences.touchGestures||!start)return;
    const touch=event.changedTouches[0];
    const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
    if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.2){
      if(dx<0)next();else previous();
    }else if(Math.abs(dy)>85&&Math.abs(dy)>Math.abs(dx)*1.2){
      haptic();
      if(dy<0)setModal("queue");else setModal("lyrics");
    }
  };
  useEffect(()=>{
    const session=navigator.mediaSession;
    if(!session)return;
    if(!current){session.metadata=null;session.playbackState="none";return;}
    try{
      if(typeof MediaMetadata!=="undefined"){
        const cover=current.artwork? [{src:current.artwork,sizes:"512x512"}] : [];
        session.metadata=new MediaMetadata({title:current.title,artist:current.artist,album:current.album||"LYNE",artwork:cover});
      }
      session.playbackState=playing?"playing":"paused";
    }catch{}
    const bind=(action:MediaSessionAction,handler:MediaSessionActionHandler|null)=>{try{session.setActionHandler(action,handler);}catch{}};
    bind("play",()=>setPlaying(true));
    bind("pause",()=>setPlaying(false));
    bind("previoustrack",()=>previous());
    bind("nexttrack",()=>next());
    bind("seekto",details=>{if(typeof details.seekTime==="number"&&audioRef.current){audioRef.current.currentTime=Math.max(0,details.seekTime);setPosition(audioRef.current.currentTime*1000);}});
    bind("seekbackward",details=>{if(audioRef.current){const offset=details.seekOffset??10;audioRef.current.currentTime=Math.max(0,audioRef.current.currentTime-offset);setPosition(audioRef.current.currentTime*1000);}});
    bind("seekforward",details=>{if(audioRef.current){const offset=details.seekOffset??10;const limit=Number.isFinite(audioRef.current.duration)?audioRef.current.duration:Infinity;audioRef.current.currentTime=Math.min(limit,audioRef.current.currentTime+offset);setPosition(audioRef.current.currentTime*1000);}});
    return ()=>{["play","pause","previoustrack","nexttrack","seekto","seekbackward","seekforward"].forEach(action=>bind(action as MediaSessionAction,null));};
  },[current?.id,current?.title,current?.artist,current?.album,current?.artwork,playing,queue,shuffle,position,duration]);
  useEffect(()=>{
    const session=navigator.mediaSession;
    if(!session||typeof session.setPositionState!=="function"||duration<=0)return;
    try{session.setPositionState({duration:duration/1000,position:Math.min(position,duration)/1000,playbackRate:audioRef.current?.playbackRate||1});}catch{}
  },[position,duration,playing]);
  const allTracks=useMemo(()=>{const unique=new Map<string,Track>();[...homeTracks,...results,...state.history,...localTracks].forEach(track=>unique.set(track.id,track));return [...unique.values()];}, [localTracks,homeTracks,results,state.history]);
  const selectedPlaylist=state.playlists.find(p=>p.id===selectedPlaylistId)||null;
  const selectedPlaylistTracks=selectedPlaylist?selectedPlaylist.trackIds.map(id=>allTracks.find(track=>track.id===id)).filter(Boolean) as Track[]:[];
  const likedTracks=useMemo(()=>state.likes.map(id=>allTracks.find(t=>t.id===id)).filter(Boolean) as Track[],[state.likes,allTracks]);
  const syncedLyrics=useMemo(()=>parseSyncedLyrics(current?.lyrics||""),[current?.lyrics]);
  const activeLyricIndex=syncedLyrics.reduce((active,line,index)=>line.timeMs+state.preferences.lyricsOffsetMs<=position?index:active,-1);
  const search=async(value:string,kind:SearchKind)=>{setQuery(value);setFilter(kind);setSearchError("");if(value.trim().length<2){setResults([]);setArtistResults([]);setAlbumResults([]);setPlaylistResults([]);return;}setLoadingSearch(true);try{const data=await lyneApi.search(value,kind);setResults(data.tracks||[]);setArtistResults(data.artists||[]);setAlbumResults(data.albums||[]);setPlaylistResults(data.playlists||[]);}catch(error){setResults([]);setArtistResults([]);setAlbumResults([]);setPlaylistResults([]);setSearchError(error instanceof Error?error.message:"Search is unavailable right now.");}finally{setLoadingSearch(false);}};
  const openArtist=async(id:string)=>{
    setDetailBusy(true);setDetailError("");detailRetryRef.current=()=>{void openArtist(id);};setArtistDetail(null);setModal("artistDetail");
    try{const detail=await lyneApi.artist(id);setArtistDetail(detail);}
    catch(e){setDetailError(e instanceof Error?e.message:"Couldn't load that artist.");}
    finally{setDetailBusy(false);}
  };
  const deepLinkHandledRef=useRef(false);
  useEffect(()=>{
    if(deepLinkHandledRef.current)return;
    deepLinkHandledRef.current=true;
    const artistId=new URLSearchParams(window.location.search).get("artist");
    if(artistId)void openArtist(artistId);
  },[openArtist]);
  const shareArtist=async(artist:{id:string;name:string})=>{
    const url=new URL(window.location.href);
    url.searchParams.set("artist",artist.id);
    const link=url.toString();
    try{
      if(typeof navigator.share==="function")await navigator.share({title:artist.name,text:"Listen to "+artist.name+" on LYNE",url:link});
      else if(navigator.clipboard){await navigator.clipboard.writeText(link);setNotice("Artist link copied.");}
      else setNotice(link);
    }catch(error){if(error instanceof Error&&error.name!=="AbortError")setNotice("Couldn't share this artist link.");}
  };
  const toggleSavedArtist=(artist:{id:string;name:string;artwork?:string})=>{
    const saved=state.savedArtists.some(item=>item.id===artist.id);
    setState(old=>({...old,savedArtists:saved?old.savedArtists.filter(item=>item.id!==artist.id):[{...artist},...old.savedArtists]}));
    setNotice(saved?"Artist removed from your Library.":"Artist saved to your Library.");
  };
  const openAlbum=async(id:string)=>{
    setDetailBusy(true);setDetailError("");detailRetryRef.current=()=>{void openAlbum(id);};setAlbumDetail(null);setModal("albumDetail");
    try{const detail=await lyneApi.album(id);setAlbumDetail(detail);}
    catch(e){setDetailError(e instanceof Error?e.message:"Couldn't load that album.");}
    finally{setDetailBusy(false);}
  };
  const openPublicPlaylist=async(id:string)=>{
    setDetailBusy(true);setDetailError("");detailRetryRef.current=()=>{void openPublicPlaylist(id);};setPublicPlaylistDetail(null);setModal("publicPlaylistDetail");
    try{const detail=await lyneApi.publicPlaylist(id);setPublicPlaylistDetail(detail);}
    catch(e){setDetailError(e instanceof Error?e.message:"Couldn't load that playlist.");}
    finally{setDetailBusy(false);}
  };
  const importFiles=async(files:FileList|null)=>{
    if(!files)return;
    const audioFiles=Array.from(files).filter(file=>file.type.startsWith("audio/"));
    if(!audioFiles.length){setNotice("No supported audio files selected.");return;}
    const added=audioFiles.map((file,index)=>({
      id:`local-${Date.now()}-${index}-${Math.random().toString(36).slice(2,7)}`,
      title:file.name.replace(/\.[^.]+$/,""),
      artist:"Local file",
      audioUrl:URL.createObjectURL(file),
      audioMime:file.type,audioSize:file.size,
      durationMs:0,
      source:"local" as const
    }));
    setLocalTracks(old=>[...old,...added]);
    const saved=await Promise.allSettled(added.map((track,index)=>saveAudioFile(track.id,audioFiles[index])));
    const savedCount=saved.filter(item=>item.status==="fulfilled").length;
    try{await navigator.storage?.persist?.();}catch{}
    setNotice(savedCount===added.length
      ?`Added ${added.length} local track${added.length===1?"":"s"} and saved them on this device.`
      :`Added ${added.length} track${added.length===1?"":"s"}; ${added.length-savedCount} could not be saved for the next visit.`);
  };
  const deleteLocalTrack=async(track:Track)=>{
    try{await removeAudioFile(track.id);}catch{setNotice("Could not remove the saved copy from device storage.");return;}
    if(track.audioUrl)URL.revokeObjectURL(track.audioUrl);
    setLocalTracks(items=>items.filter(item=>item.id!==track.id));
    setQueue(items=>items.filter(item=>item.id!==track.id));
    setState(old=>({...old,offlineMixes:old.offlineMixes.map(mix=>({...mix,trackIds:mix.trackIds.filter(id=>id!==track.id)})).filter(mix=>mix.trackIds.length>0)}));
    if(current?.id===track.id){setPlaying(false);setCurrent(null);setPosition(0);}
    setModal(null);
    setNotice("Removed "+track.title+" from this device.");
  };
  const beginLocalMetadataEdit=(track:Track)=>{
    setLocalMetaEdit({id:track.id,title:track.title,artist:track.artist,album:track.album||"",artwork:track.artwork||""});
  };
  const saveLocalMetadata=async()=>{
    if(!localMetaEdit)return;
    const existing=localTracks.find(item=>item.id===localMetaEdit.id);
    if(!existing)return;
    const updated:Track={...existing,title:localMetaEdit.title.trim()||"Untitled track",artist:localMetaEdit.artist.trim()||"Unknown artist",album:localMetaEdit.album.trim()||undefined,artwork:localMetaEdit.artwork||undefined};
    try{
      const stored=(await readAudioFiles()).find(item=>item.id===updated.id);
      if(!stored)throw new Error("The original audio file is no longer available in device storage.");
      await saveAudioFile(updated.id,stored.file,{...updated,audioUrl:undefined});
      setLocalTracks(items=>items.map(item=>item.id===updated.id?updated:item));
      setQueue(items=>items.map(item=>item.id===updated.id?updated:item));
      if(current?.id===updated.id)setCurrent(updated);
      setActiveTrack(updated);
      setLocalMetaEdit(undefined);
      setNotice("Local track details saved on this device.");
    }catch(error){setNotice(error instanceof Error?error.message:"Could not save local track details.");}
  };

  const downloadTrackOffline=async(track:Track,notify=true,additionalBytes=0):Promise<number>=>{
    if(!track.audioUrl||track.source==="local")return -1;
    if(localTracks.some(item=>item.id===track.id&&item.offline))return 0;
    setOfflineBusy(true);
    try{
      const response=await fetch(track.audioUrl,{credentials:"omit"});
      if(!response.ok)throw new Error("The track could not be downloaded from LYNE.");
      const blob=await response.blob();
      if(!blob.size)throw new Error("LYNE returned an empty audio file.");
      const used=localTracks.filter(item=>item.offline&&item.id!==track.id).reduce((sum,item)=>sum+(item.audioSize||0),0);
      const limit=state.preferences.cacheLimitMb*1024*1024;
      if(used+additionalBytes+blob.size>limit)throw new Error("This download exceeds your "+state.preferences.cacheLimitMb+" MB offline storage limit. Increase the limit or remove saved tracks.");
      const safeName=track.title.replace(/[\\/:*?"<>|]/g,"_");
      const file=new File([blob],safeName+".audio",{type:blob.type||track.audioMime||"audio/mpeg"});
      await saveAudioFile(track.id,file,{...track,offline:true});
      const audioUrl=URL.createObjectURL(blob);
      const saved={...track,audioUrl,audioMime:file.type,audioSize:file.size,offline:true};
      setLocalTracks(items=>[...items.filter(item=>item.id!==track.id),saved]);
      try{await navigator.storage?.persist?.();}catch{}
      void refreshStorage();
      if(notify)setNotice(track.title+" is saved for offline playback on this device.");
      return file.size;
    }catch(error){
      if(notify)setNotice(error instanceof Error?error.message:"Could not save this track offline.");
      return -1;
    }finally{setOfflineBusy(false);}
  };
  const downloadMixOffline=async(mix:{id:string;title:string;artwork?:string;tracks:Track[]})=>{
    if(offlineMixId)return;
    setOfflineMixId(mix.id);
    const unique=[...new Map(mix.tracks.map(track=>[track.id,track])).values()];
    let additionalBytes=0,saved=0,failed=0;
    const savedTrackIds:string[]=[];
    for(const track of unique){
      const bytes=await downloadTrackOffline(track,false,additionalBytes);
      if(bytes>=0){saved++;additionalBytes+=bytes;savedTrackIds.push(track.id);}else failed++;
    }
    if(savedTrackIds.length){
      setState(old=>({...old,offlineMixes:[{id:mix.id,title:mix.title,artwork:mix.artwork,trackIds:savedTrackIds},...old.offlineMixes.filter(item=>item.id!==mix.id)]}));
    }
    setOfflineMixId(null);
    setNotice(failed?("Saved "+saved+" of "+unique.length+" tracks from "+mix.title+". "+failed+" could not be saved."):(saved+" tracks from "+mix.title+" are ready offline."));
  };

  const resolveImportLink=async()=>{if(!importUrl.trim())return;setImportBusy(true);setImportError("");setImportPreview(null);try{const item=await lyneApi.resolveImport(importUrl.trim());setImportPreview(item);}catch(e){setImportError(e instanceof Error?e.message:"LYNE couldn't read that link.");}finally{setImportBusy(false);}};
  const saveImportedLink=async()=>{
    if(!importPreview||importSaving)return;
    const previousCollection=state.importedCollections.find(item=>item.provider===importPreview.provider&&item.providerId===importPreview.providerId&&item.kind===importPreview.kind);
    const saved:SavedImport={...importPreview,...(previousCollection?.addedTracks?.length?{addedTracks:previousCollection.addedTracks}:{})};
    const alreadySaved= saved.kind==="track"
      ?state.importedLikes.some(item=>item.provider===saved.provider&&item.providerId===saved.providerId)
      :state.importedCollections.some(item=>item.provider===saved.provider&&item.providerId===saved.providerId&&item.kind===saved.kind);
    setImportSaving(true);setImportError("");
    setState(old=>saved.kind==="track"
      ?({...old,importedLikes:[saved,...old.importedLikes.filter(item=>!(item.provider===saved.provider&&item.providerId===saved.providerId))]})
      :({...old,importedCollections:[saved,...old.importedCollections.filter(item=>!(item.provider===saved.provider&&item.providerId===saved.providerId&&item.kind===saved.kind))]}));
    try{
      if(user)await lyneApi.saveImport(saved);
      setModal(null);
      setNotice(alreadySaved?"Updated the saved "+providerName(saved.provider)+" item.":user?"Added and synced with your LYNE account.":saved.kind==="track"?"Added to Liked Songs on this device. Sign in to sync it.":"Added to your library on this device. Sign in to sync it.");
    }catch(error){
      setImportError(error instanceof Error?error.message:"Account sync failed. Retry to sync this saved link.");
      setNotice("Saved locally. Account sync failed; retry from this preview.");
    }finally{setImportSaving(false);}
  };
  const likeImportedTrack=(collection:SavedImport,track:NonNullable<SavedImport["tracks"]>[number])=>{const saved:SavedImport={provider:collection.provider,kind:"track",providerId:track.providerId,title:track.title,subtitle:track.artist,externalUrl:track.externalUrl,artwork:track.artwork,embedUrl:track.embedUrl,tracks:[track]};setState(s=>({...s,importedLikes:[saved,...s.importedLikes.filter(x=>!(x.provider===saved.provider&&x.providerId===saved.providerId))]}));if(user)void lyneApi.saveImport(saved).catch(()=>setNotice("Added locally. Account sync couldn't be completed."));setNotice(`Added ${track.title} to Liked Songs.`);};
  const normalizeImportedText=(value:string)=>value.normalize("NFKD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const findLocalTrackForImport=(title:string,artist:string):Track|null=>{
    const wantedTitle=normalizeImportedText(title);
    if(!wantedTitle)return null;
    const titleMatches=localTracks.filter(track=>normalizeImportedText(track.title)===wantedTitle);
    const wantedArtist=normalizeImportedText(artist);
    const artistMatches=titleMatches.filter(track=>{
      const localArtist=normalizeImportedText(track.artist);
      return !localArtist||localArtist==="local file"||localArtist===wantedArtist;
    });
    return artistMatches.length===1?artistMatches[0]:null;
  };
  const importedLocalAudioReady=(item:SavedImport)=>Boolean(findLocalTrackForImport(item.title,item.subtitle));
  const findPlayableCatalogTrackForImport=async(title:string,artist:string):Promise<Track|null>=>{
    const wantedTitle=normalizeImportedText(title),wantedArtist=normalizeImportedText(artist);
    if(!wantedTitle||!wantedArtist)return null;
    try{
      const result=await lyneApi.search([title,artist].filter(Boolean).join(" "),"tracks");
      const playable=result.tracks.filter(track=>Boolean(track.audioUrl));
      return playable.find(track=>normalizeImportedText(track.title)===wantedTitle&&normalizeImportedText(track.artist)===wantedArtist)||null;
    }catch{return null;}
  };
  const openImportedPlayback=async(item:{provider:SavedImport["provider"];title:string;subtitle:string;externalUrl:string;providerId:string;embedUrl?:string;artwork?:string;tracks?:{providerId:string;title:string;artist:string;durationMs?:number}[]})=>{
    if(item.provider==="soundcloud"){
      setNotice("Connecting to SoundCloud for the full-length stream...");
      try{
        const stream=await lyneApi.soundcloudPlayback(item.providerId);
        const trackInfo=item.tracks?.[0];
        const playable:Track={id:"sc:"+item.providerId,title:trackInfo?.title||item.title,artist:trackInfo?.artist||item.subtitle,artwork:item.artwork,audioUrl:stream.url,audioMime:stream.mimeType,durationMs:stream.durationMs||trackInfo?.durationMs,source:"catalog"};
        play(playable,[playable]);
        setNotice("Playing the SoundCloud track in LYNE.");
        return;
      }catch(error){
        setNotice(error instanceof Error?error.message:"SoundCloud couldn't provide a full-length stream.");
        return;
      }
    }
    const localMatch=findLocalTrackForImport(item.title,item.subtitle);
    if(localMatch){
      play(localMatch,[localMatch]);
      setNotice("Playing your local audio file in LYNE.");
      return;
    }
    setNotice("Checking the LYNE catalogue for an exact full-length match...");
    const match=await findPlayableCatalogTrackForImport(item.title,item.subtitle);
    if(match){
      play(match,[match]);
      setNotice("Playing "+match.title+" in LYNE.");
      return;
    }
    setNotice('“'+item.title+'” is saved in your Library, but no exact full-length match is available yet. Add the audio file in Local Files or publish a recording you have rights to distribute to the LYNE catalogue. Provider links are never used as embedded playback.');
  };
  const likeAllImportedTracks=async(collection:SavedImport)=>{
    const tracks=collection.tracks||[];
    const additions=tracks.map(track=>({provider:collection.provider,kind:"track" as const,providerId:track.providerId,title:track.title,subtitle:track.artist,externalUrl:track.externalUrl,artwork:track.artwork,embedUrl:track.embedUrl,tracks:[track]}));
    const already=new Set(state.importedLikes.map(item=>item.provider+":"+item.providerId));
    const unique=additions.filter(item=>!already.has(item.provider+":"+item.providerId));
    if(!unique.length){setModal(null);setNotice("All tracks from "+collection.title+" are already in Liked Songs.");return;}
    setImportSaving(true);setNotice("Adding "+unique.length+" tracks from "+collection.title+"...");
    setState(old=>({...old,importedLikes:[...unique,...old.importedLikes]}));
    let failures=0;
    if(user){
      const results=await Promise.allSettled(unique.map(item=>lyneApi.saveImport(item)));
      failures=results.filter(result=>result.status==="rejected").length;
    }
    setImportSaving(false);setModal(null);
    setNotice(failures?"Added "+unique.length+" tracks locally; "+failures+" account syncs failed. Re-import those source links to retry.":"Added "+unique.length+" tracks from "+collection.title+" to Liked Songs.");
  };
  const persistPlaylist=async(playlist:Playlist)=>{
    if(!user||!playlist.synced)return;
    try{await lyneApi.updatePlaylist(playlist);}
    catch{setNotice("Saved on this device, but LYNE account playlist sync failed.");}
  };
  const createPlaylist=async()=>{
    const name=playlistName.trim();if(!name)return;
    let playlist:Playlist={id:crypto.randomUUID(),name,trackIds:[],updatedAt:Date.now(),synced:false};
    if(user){
      try{playlist={...(await lyneApi.createPlaylist(name)),synced:true};}
      catch{setNotice("Playlist created on this device. Account sync isn't available.");}
    }
    setState(s=>({...s,playlists:[playlist,...s.playlists]}));
    setPlaylistName("");setModal(null);
  };
  const addToPlaylist=(playlist:Playlist,track:Track)=>{
    if(playlist.trackIds.includes(track.id)){setNotice(track.title+" is already in "+playlist.name+".");setModal(null);return;}
    const updated={...playlist,trackIds:[...playlist.trackIds,track.id],updatedAt:Date.now()};
    setState(s=>({...s,playlists:s.playlists.map(p=>p.id===playlist.id?updated:p)}));
    void persistPlaylist(updated);
    setNotice("Added "+track.title+" to "+playlist.name+".");setModal(null);
  };
  const addTrackToImportedCollection=(collection:SavedImport,track:Track)=>{
    const existing=collection.addedTracks||[];
    if(existing.some(item=>item.id===track.id)){setNotice(track.title+" is already in "+collection.title+".");setModal(null);return;}
    const updated:SavedImport={...collection,addedTracks:[...existing,track]};
    setState(old=>({...old,importedCollections:old.importedCollections.map(item=>item.provider===collection.provider&&item.providerId===collection.providerId&&item.kind===collection.kind?updated:item)}));
    setActiveCollection(updated);
    setNotice("Added "+track.title+" to "+collection.title+" on this device.");
    setModal(null);
  };
  const addNext=(track:Track)=>{setQueue(old=>{const list=old.filter(t=>t.id!==track.id);const index=list.findIndex(t=>t.id===current?.id);list.splice(index>=0?index+1:list.length,0,track);return list;});setNotice("Added "+track.title+" to play next.");setModal(null);};
  const openPlaylist=(playlist:Playlist)=>{setSelectedPlaylistId(playlist.id);setEditPlaylistName(playlist.name);setEditPlaylistDescription(playlist.description||"");setModal("playlistDetail");};
  const savePlaylistName=()=>{
    if(!selectedPlaylistId||!editPlaylistName.trim())return;
    const playlist=state.playlists.find(p=>p.id===selectedPlaylistId);if(!playlist)return;
    const updated={...playlist,name:editPlaylistName.trim(),description:editPlaylistDescription.trim(),updatedAt:Date.now()};
    setState(s=>({...s,playlists:s.playlists.map(p=>p.id===selectedPlaylistId?updated:p)}));
    void persistPlaylist(updated);setNotice("Playlist name updated.");
  };
  const setPlaylistCover=async(file:File)=>{if(!selectedPlaylistId)return;try{let cover=await resizePlaylistImage(file);if(user&&selectedPlaylist?.synced){try{const remote=await lyneApi.uploadPlaylistCover(selectedPlaylistId,file);cover=remote.cover||cover;}catch{setNotice("Artwork saved on this device, but account sync failed.");}}setState(s=>({...s,playlists:s.playlists.map(p=>p.id===selectedPlaylistId?{...p,cover,updatedAt:Date.now()}:p)}));setNotice("Playlist artwork updated.");}catch(e){setNotice(e instanceof Error?e.message:"Could not use that image.");}};
  const removePlaylistCover=async(playlist:Playlist)=>{if(user&&playlist.synced){try{await lyneApi.removePlaylistCover(playlist.id);}catch{setNotice("Could not remove the synced playlist artwork. Try again.");return;}}setState(s=>({...s,playlists:s.playlists.map(p=>p.id===playlist.id?{...p,cover:undefined,updatedAt:Date.now()}:p)}));setNotice("Playlist artwork removed.");};
  const movePlaylistTrack=(playlist:Playlist,index:number,direction:-1|1)=>{
    const target=index+direction;if(target<0||target>=playlist.trackIds.length)return;
    const trackIds=[...playlist.trackIds];[trackIds[index],trackIds[target]]=[trackIds[target],trackIds[index]];
    const updated={...playlist,trackIds,updatedAt:Date.now()};
    setState(s=>({...s,playlists:s.playlists.map(p=>p.id===playlist.id?updated:p)}));void persistPlaylist(updated);
  };
  const removePlaylistTrack=(playlist:Playlist,trackId:string)=>{
    const updated={...playlist,trackIds:playlist.trackIds.filter(id=>id!==trackId),updatedAt:Date.now()};
    setState(s=>({...s,playlists:s.playlists.map(p=>p.id===playlist.id?updated:p)}));void persistPlaylist(updated);
  };
  const deletePlaylist=async(playlist:Playlist)=>{
    if(!window.confirm("Delete the playlist \""+playlist.name+"\"?"))return;
    if(user&&playlist.synced){try{await lyneApi.deletePlaylist(playlist.id);}catch{setNotice("Couldn't delete the synced playlist. Try again.");return;}}
    setState(s=>({...s,playlists:s.playlists.filter(p=>p.id!==playlist.id)}));
    setModal(null);setSelectedPlaylistId(null);setNotice("Playlist deleted.");
  };


  const updateProfileAvatar=async(file:File)=>{
    try{
      const localAvatar=await resizePlaylistImage(file);
      setState(old=>({...old,profile:{...old.profile,avatar:localAvatar}}));
      if(user){
        try{
          const uploaded=await lyneApi.uploadAvatar(dataUrlToFile(localAvatar,"lyne-avatar.jpg"));
          setState(old=>({...old,profile:{...old.profile,avatar:uploaded.avatar}}));
          setNotice("Profile photo updated and synced with your LYNE account.");
        }catch{setNotice("Profile photo saved on this device, but account sync failed.");}
      }else setNotice("Profile photo saved on this device.");
    }catch(error){setNotice(error instanceof Error?error.message:"Could not save that profile photo.");}
  };
  const removeProfileAvatar=async()=>{
    if(user){try{await lyneApi.removeAvatar();}catch{setNotice("Could not remove the synced profile photo. Try again.");return;}}
    setState(old=>({...old,profile:{...old.profile,avatar:""}}));
    setNotice("Profile photo removed.");
  };

  const submitAccount=async()=>{
    if(!accountName.trim()||!accountPassword){setAccountMessage("Enter your username/email and password.");return;}
    if(accountMode==="register"&&(!accountEmail.trim()||accountPassword.length<10)){setAccountMessage("Enter a valid email and a password with at least 10 characters.");return;}
    setAccountBusy(true);setAccountMessage("Connecting to LYNE...");
    try{
      const result=accountMode==="login"
        ?await lyneApi.login(accountName.trim(),accountPassword)
        :await lyneApi.register(accountName.trim(),accountEmail.trim(),accountPassword);
      localStorage.setItem("lyne.accessToken",result.accessToken);
      setUser(result.user);setGuestMode(false);
      try{
        const [profile,remote,imports,history,preferences]=await Promise.all([lyneApi.me(),lyneApi.playlists(),lyneApi.getImports(),lyneApi.listeningHistory(),lyneApi.preferences()]);
        const syncedLocal=await syncPendingPlaylists(state.playlists);
        const remotePlaylists=remote.playlists.map(item=>({...item,synced:true}));
        const merged=[...remotePlaylists,...syncedLocal.filter(item=>!remotePlaylists.some(remoteItem=>remoteItem.id===item.id))];
        setUser({id:profile.id,username:profile.username});
        setState(old=>({...old,profile:{...old.profile,name:profile.username,avatar:profile.avatar||old.profile.avatar},playlists:merged,importedLikes:imports.likes||[],importedCollections:mergeLocalCollectionTracks(imports.collections||[],old.importedCollections),stats:history.stats||[],preferences:{...old.preferences,...preferences.preferences} as typeof old.preferences,theme:["dark","light","system"].includes(String(preferences.preferences.theme))?String(preferences.preferences.theme):old.theme}));
        setAccountSyncReady(true);
      }catch{setAccountSyncReady(true);setNotice("Signed in. Some account library data could not be loaded yet; local settings will be kept.");}
      setAccountMessage("You're signed in.");setModal(null);setNotice("Signed in to LYNE.");
    }catch(e){localStorage.removeItem("lyne.accessToken");setAccountMessage(e instanceof Error?e.message:"Couldn't connect to LYNE.");}
    finally{setAccountBusy(false);}
  };
  const logout=()=>{localStorage.removeItem("lyne.accessToken");setAccountSyncReady(false);setUser(null);setGuestMode(false);setNotice("Signed out.");};
  const saveUsername=async()=>{
    const username=editUsername.trim();
    if(!/^[A-Za-z0-9_]{3,24}$/.test(username)){setNotice("Username must be 3–24 characters using letters, numbers, and underscores.");return;}
    if(!user){setNotice("Sign in to edit your LYNE username.");return;}
    setProfileUpdateBusy(true);
    try{
      const result=await lyneApi.updateProfile(username);
      setUser(old=>old?{...old,username:result.username}:old);
      setState(old=>({...old,profile:{...old.profile,name:result.username}}));
      setModal(null);
      setNotice("LYNE username updated.");
    }catch(error){setNotice(error instanceof Error?error.message:"Could not update your username.");}
    finally{setProfileUpdateBusy(false);}
  };


  const connectApi=async()=>{
    setApiTesting(true);setApiMessage("Testing LYNE Worker...");
    try{
      configureApiUrl(apiUrlInput);
      if(!isApiConfigured())throw new Error("Enter the deployed LYNE Worker URL first.");
      setApiStatus("checking");
      const health=await lyneApi.health();
      if(!health.ok)throw new Error("The LYNE Worker responded but did not pass its health check.");
      setApiStatus("online");setApiMessage("");
      const home=await lyneApi.home();
      setHomeTracks([...(home.recentlyPlayed||[]),...(home.popular||[])]);
      setHomeMixes(home.mixes||[]);
      setNotice("LYNE API connected successfully.");
    }catch(error){
      setApiStatus("offline");
      setApiMessage(error instanceof Error?error.message:"Could not connect to the LYNE API.");
    }finally{setApiTesting(false);}
  };
  const refreshStorage=async()=>{try{const estimate=await navigator.storage?.estimate();setStorageUsed(estimate?.usage??0);}catch{setStorageUsed(null);}};
  const clearCache=async()=>{try{const names=await caches.keys();await Promise.all(names.filter(name=>!name.startsWith("lyne-mobile-shell-")).map(name=>caches.delete(name)));await refreshStorage();setNotice("Temporary cached files cleared. The offline app shell, saved music and library data were kept.");}catch{setNotice("This browser does not allow cache management here.");}};
  const periodStart=()=>{const d=new Date();if(period==="day")return dayKey(d);if(period==="week"){d.setDate(d.getDate()-6);}if(period==="month"){d.setDate(1);}if(period==="year"){d.setMonth(0,1);}return dayKey(d);};
  const periodStats=state.stats.filter(x=>x.day>=periodStart());
  const totalMinutes=Math.floor(periodStats.reduce((sum,x)=>sum+x.ms,0)/60000);
  const ranking=(key:"title"|"artist")=>{const counts=new Map<string,number>();periodStats.forEach(x=>counts.set(x[key],(counts.get(x[key])||0)+x.ms));return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);};
  const wrappedYear=new Date().getFullYear()-1;
  const wrappedStats=state.stats.filter(item=>item.day.startsWith(String(wrappedYear)));
  const wrappedMinutes=Math.floor(wrappedStats.reduce((sum,item)=>sum+item.ms,0)/60000);
  const wrappedRanking=(key:"title"|"artist")=>{const counts=new Map<string,number>();wrappedStats.forEach(item=>counts.set(item[key],(counts.get(item[key])||0)+item.ms));return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);};
  const shareStats=async()=>{
    const songs=ranking("title").slice(0,5);
    const artists=ranking("artist").slice(0,5);
    const content="LYNE listening stats\n"+totalMinutes.toLocaleString()+" minutes listened\nTop songs: "+(songs.map(x=>x[0]).join(", ")||"Not enough data yet")+"\nTop artists: "+(artists.map(x=>x[0]).join(", ")||"Not enough data yet");
    try{
      const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1350;
      const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Image export is not supported in this browser.");
      const accentColor=`rgb(${ambientColor.split(",").join(" ")})`;const accentSoft=`rgba(${ambientColor},.2)`;const gradient=ctx.createLinearGradient(0,0,1080,1350);gradient.addColorStop(0,accentSoft);gradient.addColorStop(.55,"#09090b");gradient.addColorStop(1,"#050505");ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,1350);
      ctx.fillStyle=accentColor;ctx.font="800 68px Inter,Arial";ctx.fillText("LYNE",76,120);
      ctx.fillStyle="#f4f4f5";ctx.font="700 54px Inter,Arial";ctx.fillText("YOUR LISTENING STATS",76,245);
      ctx.fillStyle=accentColor;ctx.font="800 150px Inter,Arial";ctx.fillText(totalMinutes.toLocaleString(),76,445);
      ctx.fillStyle="rgba(244,244,245,.68)";ctx.font="500 34px Inter,Arial";ctx.fillText("MINUTES LISTENED · "+period.toUpperCase(),80,510);
      ctx.fillStyle="#f4f4f5";ctx.font="700 40px Inter,Arial";ctx.fillText("TOP SONGS",76,650);
      songs.forEach(([name],i)=>{ctx.fillStyle=accentColor;ctx.font="700 30px Inter,Arial";ctx.fillText(String(i+1).padStart(2,"0"),80,720+i*72);ctx.fillStyle="#f4f4f5";ctx.font="500 30px Inter,Arial";ctx.fillText(name.slice(0,42),155,720+i*72);});
      ctx.fillStyle="#f4f4f5";ctx.font="700 40px Inter,Arial";ctx.fillText("TOP ARTISTS",76,1110);
      artists.slice(0,3).forEach(([name],i)=>{ctx.fillStyle=accentColor;ctx.font="600 26px Inter,Arial";ctx.fillText(name.slice(0,30),80,1170+i*48);});
      ctx.fillStyle="rgba(244,244,245,.45)";ctx.font="500 22px Inter,Arial";ctx.fillText("YOUR MUSIC. YOUR SPACE.",76,1300);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Could not create the stats image.")),"image/png"));
      const imageFile=new File([blob],"lyne-listening-stats.png",{type:"image/png"});
      if(navigator.share&&navigator.canShare?.({files:[imageFile]})){await navigator.share({title:"My LYNE listening stats",text:content,files:[imageFile]});setNotice("Your LYNE stats image is ready to share.");}
      else{const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="lyne-listening-stats.png";link.click();URL.revokeObjectURL(url);if(navigator.clipboard)await navigator.clipboard.writeText(content);setNotice("Saved your LYNE stats image.");}
    }catch(error){if(error instanceof DOMException&&error.name==="AbortError")return;try{if(navigator.share)await navigator.share({title:"My LYNE stats",text:content});else if(navigator.clipboard)await navigator.clipboard.writeText(content);else throw error;setNotice("Shared your LYNE listening stats.");}catch{setNotice("Could not share your stats from this browser.");}}
  };
  const tracksForTab=tab==="Library"?likedTracks:homeTracks;
  const hour=new Date().getHours();
  const greeting=hour>=5&&hour<12?"Good morning":hour>=12&&hour<17?"Good afternoon":hour>=17&&hour<22?"Good evening":"Good night";
  const dateLabel=new Intl.DateTimeFormat("en",{weekday:"long",month:"long",day:"numeric"}).format(new Date());
  const [libraryFilter,setLibraryFilter]=useState<"all"|"playlists"|"albums"|"artists">("all");
  const [libraryQuery,setLibraryQuery]=useState("");
  const [libraryViewMode,setLibraryViewMode]=useState<"grid"|"list">("grid");
  const renderRows=(items:Track[])=>items.length?<div className="track-list">{items.map(t=><Row key={t.id} track={t} active={current?.id===t.id} liked={state.likes.includes(t.id)} onPlay={()=>state.preferences.trackTapBehavior==="queue"?addNext(t):play(t,items)} onLike={()=>toggleLike(t)} onMore={()=>{setActiveTrack(t);setLocalMetaEdit(undefined);setModal("track");}}/>)}</div>:<Empty title="Nothing here yet" text="Your music will show up here once LYNE's catalogue is connected, or add audio files from your device."/>;
  const renderHomeCards=(items:Track[])=>items.length?<div className="home-card-rail">{items.map((track,index)=><button className="home-track-card" key={track.id} onClick={()=>play(track,items)}><div className="home-track-art"><Cover track={track}/><span className="home-track-play"><Play size={18} fill="currentColor"/></span></div><b>{track.title}</b><small>{track.artist}</small></button>)}</div>:<Empty title="Nothing here yet" text="Your music will show up here once LYNE's catalogue is connected, or add audio files from your device."/>;
  const renderAlbumCards=(items:typeof popularAlbums)=>items.length?<div className="home-card-rail">{items.map(album=><button className="home-track-card home-album-card" key={album.id} onClick={()=>void openAlbum(album.id)}><div className="home-track-art"><div className="cover" style={album.artwork?{backgroundImage:"url(\""+album.artwork+"\")"}:undefined}>{!album.artwork&&<Disc3 size={27}/>}</div><span className="home-track-play"><Play size={18} fill="currentColor"/></span></div><b>{album.title}</b><small>{album.artist}{album.trackCount?" · "+album.trackCount+" tracks":""}</small></button>)}</div>:<Empty title="No albums yet" text="Albums added to the LYNE catalogue will appear here."/>;
  if(!user&&!guestMode)return <main className="auth-shell">
    <div className="auth-glow"/>
    <header className="auth-brand"><span>LYNE</span><i/></header>
    <section className="auth-panel">
      <p className="eyebrow">YOUR MUSIC. YOUR SPACE.</p>
      <h1>{accountMode==="login"?"Welcome back":"Create your LYNE account"}</h1>
      <p className="auth-subtitle">{accountMode==="login"?"Sign in to sync your library, playlists and listening history.":"Create an account and keep your LYNE collection in sync."}</p>
      <div className="auth-mode"><button className={accountMode==="login"?"active":""} onClick={()=>{setAccountMode("login");setAccountMessage("");}}>Sign in</button><button className={accountMode==="register"?"active":""} onClick={()=>{setAccountMode("register");setAccountMessage("");}}>Create account</button></div>
      <form onSubmit={event=>{event.preventDefault();void submitAccount();}}>
        <label className="auth-field"><span>Username or email</span><input value={accountName} onChange={event=>setAccountName(event.target.value)} autoComplete="username" placeholder="Your username or email" required/></label>
        {accountMode==="register"&&<label className="auth-field"><span>Email address</span><input value={accountEmail} onChange={event=>setAccountEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required/></label>}
        <label className="auth-field"><span>Password</span><input value={accountPassword} onChange={event=>setAccountPassword(event.target.value)} type="password" autoComplete={accountMode==="login"?"current-password":"new-password"} placeholder={accountMode==="login"?"Your password":"At least 10 characters"} required minLength={accountMode==="register"?10:1}/></label>
        <button className="auth-submit" type="submit" disabled={accountBusy}>{accountBusy?<LoaderCircle className="spin" size={16}/>:null}{accountBusy?"Connecting...":accountMode==="login"?"Sign in to LYNE":"Create account"}</button>
      </form>
      {accountMessage&&<p className="auth-message" role="status">{accountMessage}</p>}
      <div className="auth-divider"><span>OR</span></div>
      <button className="auth-guest" onClick={()=>setGuestMode(true)}>Continue as guest</button>
      <details className="auth-api-details">
        <summary>Server connection {apiStatus==="online"?"· Connected":isApiConfigured()?"· Check URL":"· Setup needed"}</summary>
        <label className="auth-field"><span>LYNE Worker URL</span><input value={apiUrlInput} onChange={event=>setApiUrlInput(event.target.value)} placeholder="https://lyne-api.your-subdomain.workers.dev" inputMode="url"/></label>
        <button className="auth-api-test" type="button" onClick={()=>void connectApi()} disabled={apiTesting}>{apiTesting?"Testing...":"Save URL & test"}</button>
        {apiMessage&&<p className="auth-api-message">{apiMessage}</p>}
      </details>
      <p className="auth-footnote">Guest mode keeps local music and preferences on this device. Sign in any time to sync account features.</p>
    </section>
    <p className="auth-version">LYNE MOBILE · BUILT AROUND YOUR MUSIC</p>
  </main>;

  return <main className="app-shell" style={customBackground?{backgroundImage:`linear-gradient(rgba(0,0,0,.28),rgba(0,0,0,.28)),url("${customBackground}")`,backgroundSize:"cover",backgroundPosition:"center"}:undefined}>
    <audio ref={audioRef} crossOrigin="anonymous" onEnded={()=>{if(state.repeat==="one"&&audioRef.current){audioRef.current.currentTime=0;void audioRef.current.play();}else next();}} onError={()=>{setPlaying(false);setNotice("Playback failed or the audio stream was interrupted. Check your connection, then tap Play to retry or choose another track.");}} onTimeUpdate={e=>setPosition(e.currentTarget.currentTime*1000)} onLoadedMetadata={e=>setDuration(e.currentTarget.duration*1000)} />
    <header className="topbar">
      <button className="brand" type="button" aria-label="LYNE Home" onClick={()=>setTab("Home")}>
        <img src="/LYNE-MOBILE/lyne-wordmark.png" alt="LYNE" width="54" height="27"/>
      </button>
      <div className="top-actions">
        
        <button className="avatar" onClick={()=>setTab("Profile")} aria-label="Open profile">
          {state.profile.avatar?<img src={state.profile.avatar} alt=""/>:state.profile.name.slice(0,1).toUpperCase()}
        </button>
      </div>
    </header>
    {!networkOnline&&<div className="api-note network-banner"><span>You're offline</span><small>Your on-device library, saved catalogue tracks, profile and settings remain available. Catalogue search and account sync need a connection.</small></div>}
    <section className={`page page-${tab.toLowerCase()}`} key={tab}>
      {tab==="Home"&&<>
        {apiStatus==="checking"&&<div className="loading home-loading"><LoaderCircle className="spin"/> Connecting to LYNE...</div>}
        {homeLoading&&<div className="loading home-loading"><LoaderCircle className="spin"/> Loading your home...</div>}
        {homeError&&<div className="api-note home-error" role="alert"><span>Home could not load</span><small>{homeError}</small><button type="button" className="secondary-action" onClick={()=>void loadHome()}>Try again</button></div>}
        {homeMixes.length>0&&<>
          <div className="windows-daily-mixes-heading">
            <div className="mix-fluid-square" aria-hidden="true"><i/><i/><i/></div>
            <h1>Your Mixes</h1>
          </div>
          <div className="mix-grid">
            {homeMixes.map((mix,i)=><div className="mix-card" key={mix.id}>
              <button className="mix-tile" onClick={()=>{if(mix.tracks[0])play(mix.tracks[0],mix.tracks);}} aria-label={`Play ${mix.title}`}>
                <MixArtwork artworkUrl={mix.artwork} number={i+1}/>
                <b>{mix.title}</b>
                <small>{mix.tracks.slice(0,3).map(track=>track.artist).filter(Boolean).join(", ")||`${mix.tracks.length} tracks`}</small>
              </button>
              <button type="button" className="mix-download-action" title="Save mix offline" aria-label={`Save ${mix.title} offline`} disabled={offlineMixId!==null||!mix.tracks.some(track=>Boolean(track.audioUrl))} onClick={()=>void downloadMixOffline(mix)}>
                {offlineMixId===mix.id?<LoaderCircle size={15} className="spin"/>:<Download size={15}/>}
              </button>
            </div>)}
          </div>
        </>}
        {state.offlineMixes.length>0&&<>
          <div className="section-heading windows-section-heading"><h2>Saved Offline</h2></div>
          <div className="mix-grid">
            {state.offlineMixes.map((mix,i)=>{const tracks=mix.trackIds.map(id=>localTracks.find(track=>track.id===id&&track.offline)).filter((track):track is Track=>Boolean(track));return <div className="mix-card" key={mix.id}>
              <button className="mix-tile" onClick={()=>{if(tracks[0])play(tracks[0],tracks);}}>
                <MixArtwork artworkUrl={mix.artwork} number={i+1}/>
                <b>{mix.title}</b><small>{tracks.length} tracks saved</small>
              </button>
            </div>;})}
          </div>
        </>}
        {popularAlbums.length>0&&<><div className="section-heading windows-section-heading"><span className="windows-section-icon album-icon"><AlbumFill size={24}/></span><h2>Top Albums</h2></div>{renderAlbumCards(popularAlbums)}</>}
        {listeningNowTracks.length>0&&<><div className="section-heading windows-section-heading"><span className="windows-section-icon listening-icon"><FireFill size={24}/></span><h2>Listening right now</h2></div>{renderHomeCards(listeningNowTracks)}</>}
        {state.history.length>0&&<><div className="section-heading windows-section-heading"><span className="windows-section-icon recent-icon"><TimeFill size={24}/></span><h2>Jump back in</h2></div>{renderHomeCards(state.history.slice(0,12))}</>}
        {homeTracks.length>0&&<><div className="section-heading windows-section-heading"><span className="windows-section-icon popular-icon"><TrophyFill size={24}/></span><h2>Most listened of all time</h2></div>{renderHomeCards(homeTracks.slice(0,12))}</>}
        {!homeLoading&&!homeError&&apiStatus==="online"&&homeMixes.length===0&&popularAlbums.length===0&&listeningNowTracks.length===0&&state.history.length===0&&localTracks.length===0&&<Empty title="Your LYNE home is quiet" text="Search the catalogue or add your own audio to start building your library."/>}
        {apiStatus==="offline"&&networkOnline&&<div className="api-note"><span>LYNE API isn't connected</span><small>{apiMessage||"Configure the first-party API to load catalogue content and sync your account."}</small></div>}
      </>}
      {tab==="Search"&&<><label className="searchbox"><Search/><input aria-label="Search tracks, artists, albums and playlists" value={query} onChange={e=>void search(e.target.value,filter)} placeholder="What do you want to listen to?"/></label><div className="filter-pills">{(["all","tracks","artists","albums","playlists"] as SearchKind[]).map(x=><button key={x} className={filter===x?"selected":""} onClick={()=>void search(query,x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div>{loadingSearch?<div className="loading"><LoaderCircle className="spin"/> Searching LYNE...</div>:<>{(filter==="all"||filter==="artists")&&artistResults.length>0&&<><div className="section-heading"><h2>Artists</h2></div><div className="catalog-grid">{artistResults.map(a=><button className="catalog-card" key={a.id} onClick={()=>void openArtist(a.id)}><div className="artist-avatar"><UserRound/></div><b>{a.name}</b><small>Artist</small></button>)}</div></>}{(filter==="all"||filter==="albums")&&albumResults.length>0&&<><div className="section-heading"><h2>Albums</h2></div><div className="catalog-grid">{albumResults.map(a=><button className="catalog-card" key={a.id} onClick={()=>void openAlbum(a.id)}><div className="cover" style={a.artwork?{backgroundImage:`url("${a.artwork}")`}:undefined}>{!a.artwork&&<Disc3/>}</div><b>{a.title}</b><small>{a.artist}</small></button>)}</div></>}{(filter==="all"||filter==="playlists")&&playlistResults.length>0&&<><div className="section-heading"><h2>Playlists</h2></div><div className="catalog-grid">{playlistResults.map(playlist=><button className="catalog-card" key={playlist.id} onClick={()=>void openPublicPlaylist(playlist.id)}><div className="cover" style={playlist.cover?{backgroundImage:`url("${playlist.cover}")`}:undefined}>{!playlist.cover&&<ListMusic/>}</div><b>{playlist.name}</b><small>by {playlist.owner}</small></button>)}</div></>}{searchError&&<div className="api-note"><span>Search unavailable</span><small>{searchError}</small></div>}{results.length===0&&artistResults.length===0&&albumResults.length===0&&playlistResults.length===0&&query.trim().length>=2&&!loadingSearch&&!searchError&&<Empty title="No matches found" text="Try a different track, artist, album or playlist name."/>}{renderRows(results)}</>}</>}
      {tab==="Library"&&<>
        <div className="library-page-title"><h1>Your Library</h1></div>
        <div className="library-tab-row" role="tablist" aria-label="Library categories">
          {(["all","playlists","albums","artists"] as const).map(item=><button type="button" key={item} role="tab" aria-selected={libraryFilter===item} className={libraryFilter===item?"active":""} onClick={()=>setLibraryFilter(item)}>{item==="all"?"All":item[0].toUpperCase()+item.slice(1)}</button>)}
        </div>
        <div className="library-toolbar">
          <label className="library-search"><Search size={16}/><input aria-label="Search your library" value={libraryQuery} onChange={e=>setLibraryQuery(e.target.value)} placeholder="Search your library"/></label>
          <div className="library-view-controls">
            <button type="button" title="Grid view" aria-label="Grid view" aria-pressed={libraryViewMode==="grid"} className={libraryViewMode==="grid"?"selected":""} onClick={()=>setLibraryViewMode("grid")}><LayoutGrid size={15}/></button>
            <button type="button" title="List view" aria-label="List view" aria-pressed={libraryViewMode==="list"} className={libraryViewMode==="list"?"selected":""} onClick={()=>setLibraryViewMode("list")}><List size={15}/></button>
          </div>
          <button type="button" className="library-import-link" aria-label="Import music link" title="Import music link" onClick={()=>{setImportUrl("");setImportPreview(null);setImportError("");setModal("import");}}><Link2 size={17}/></button>
          {libraryFilter==="playlists"&&<button className="library-create-button" onClick={()=>setModal("playlist")}><Plus size={16}/><span>Create playlist</span></button>}
          <input ref={fileRef} hidden type="file" accept="audio/*" multiple onChange={e=>{void importFiles(e.target.files);e.currentTarget.value="";}}/>
        </div>
        <div className={`library-content-grid ${libraryViewMode}`}>
          {libraryFilter==="all"&&<>
            {libraryViewMode==="grid"?<>
              <button type="button" className="library-item-card" onClick={()=>document.getElementById("liked-tracks-section")?.scrollIntoView({behavior:"smooth",block:"start"})}>
                <div className="library-item-art liked-art"><img src="/LYNE-MOBILE/likes-cover.svg" alt="" draggable={false}/></div>
                <b>Liked Songs</b><small>{likedTracks.length+state.importedLikes.length} songs</small>
              </button>
              <button type="button" className="library-item-card" onClick={()=>document.getElementById("local-files-section")?.scrollIntoView({behavior:"smooth",block:"start"})}>
                <div className="library-item-art local-art"><img src="/LYNE-MOBILE/local-files-cover.svg" alt="" draggable={false}/></div>
                <b>Local Music</b><small>{localTracks.length} tracks</small>
              </button>
            </>:<>
              <button type="button" className="library-row" onClick={()=>document.getElementById("liked-tracks-section")?.scrollIntoView({behavior:"smooth",block:"start"})}>
                <div className="library-art"><img src="/LYNE-MOBILE/likes-cover.svg" alt="" draggable={false}/></div>
                <span><b>Liked Songs</b><small>{likedTracks.length+state.importedLikes.length} songs</small></span><ChevronRight/>
              </button>
              <button type="button" className="library-row" onClick={()=>document.getElementById("local-files-section")?.scrollIntoView({behavior:"smooth",block:"start"})}>
                <div className="library-art"><img src="/LYNE-MOBILE/local-files-cover.svg" alt="" draggable={false}/></div>
                <span><b>Local Music</b><small>{localTracks.length} tracks</small></span><ChevronRight/>
              </button>
            </>}
          </>}
          {(libraryFilter==="all"||libraryFilter==="playlists")&&state.playlists.filter(item=>!libraryQuery.trim()||item.name.toLowerCase().includes(libraryQuery.trim().toLowerCase())).map(p=>libraryViewMode==="grid"
            ?<button className="library-item-card" key={p.id} onClick={()=>openPlaylist(p)}>
              <div className="library-item-art playlist-art" style={p.cover?{backgroundImage:`url("${p.cover}")`}:undefined}>{!p.cover&&<ListMusic/>}</div><b>{p.name}</b><small>{p.trackIds.length} tracks</small>
            </button>
            :<button className="library-row" key={p.id} onClick={()=>openPlaylist(p)}>
              <div className="library-art playlist-art" style={p.cover?{backgroundImage:`url("${p.cover}")`}:undefined}>{!p.cover&&<ListMusic/>}</div><span><b>{p.name}</b><small>Playlist · {p.trackIds.length} tracks</small></span><ChevronRight/>
            </button>)}
          {(libraryFilter==="all"||libraryFilter==="artists")&&state.savedArtists.filter(item=>!libraryQuery.trim()||item.name.toLowerCase().includes(libraryQuery.trim().toLowerCase())).map(artist=>libraryViewMode==="grid"
            ?<button className="library-item-card" key={artist.id} onClick={()=>void openArtist(artist.id)}>
              <div className="library-item-art artist-library-art" style={artist.artwork?{backgroundImage:`url("${artist.artwork}")`}:undefined}>{!artist.artwork&&<UserRound/>}</div><b>{artist.name}</b><small>Artist</small>
            </button>
            :<button className="library-row" key={artist.id} onClick={()=>void openArtist(artist.id)}>
              <div className="library-art artist-library-art" style={artist.artwork?{backgroundImage:`url("${artist.artwork}")`}:undefined}>{!artist.artwork&&<UserRound/>}</div><span><b>{artist.name}</b><small>Artist · Saved on this device</small></span><ChevronRight/>
            </button>)}
          {(libraryFilter==="all"||libraryFilter==="playlists"||libraryFilter==="albums")&&state.importedCollections.filter(item=>(libraryFilter==="all"||item.kind===(libraryFilter==="albums"?"album":"playlist"))&&(!libraryQuery.trim()||item.title.toLowerCase().includes(libraryQuery.trim().toLowerCase())||String(item.subtitle||"").toLowerCase().includes(libraryQuery.trim().toLowerCase()))).map(item=>libraryViewMode==="grid"
            ?<button className="library-item-card" key={item.provider+item.providerId+item.kind} onClick={()=>{setActiveCollection(item);setModal("collection");}}>
              <div className="library-item-art" style={item.artwork?{backgroundImage:`url("${item.artwork}")`}:undefined}>{!item.artwork&&<ListMusic/>}</div><b>{item.title}</b><small>{item.kind==="album"?"Album":"Playlist"} · {providerName(item.provider)}</small>
            </button>
            :<button className="imported-row" key={item.provider+item.providerId+item.kind} onClick={()=>{setActiveCollection(item);setModal("collection");}}>
              <div className="cover" style={item.artwork?{backgroundImage:`url("${item.artwork}")`}:undefined}>{!item.artwork&&<ListMusic/>}</div><span><b>{item.title}</b><small>{item.kind==="album"?"Album":"Playlist"} · {item.subtitle} · {providerName(item.provider)}</small></span><ChevronRight/>
            </button>)}
          {libraryFilter==="all"&&state.importedLikes.filter(item=>!libraryQuery.trim()||item.title.toLowerCase().includes(libraryQuery.trim().toLowerCase())).map(item=>libraryViewMode==="grid"
            ?<button className="library-item-card" key={item.provider+item.providerId} onClick={()=>openImportedPlayback(item)}>
              <div className="library-item-art" style={item.artwork?{backgroundImage:`url("${item.artwork}")`}:undefined}>{!item.artwork&&<Music2/>}</div><b>{item.title}</b><small>{item.subtitle} · {providerName(item.provider)}{importedLocalAudioReady(item)?" · Local audio ready":""}</small>
            </button>
            :<button className="imported-row" key={item.provider+item.providerId} onClick={()=>openImportedPlayback(item)}>
              <div className="cover" style={item.artwork?{backgroundImage:`url("${item.artwork}")`}:undefined}>{!item.artwork&&<Music2/>}</div><span><b>{item.title}</b><small>{item.subtitle} · {providerName(item.provider)}{importedLocalAudioReady(item)?" · Local audio ready":""}</small></span><Play size={16}/>
            </button>)}
        </div>
        {libraryFilter==="all"&&<>
          <div id="liked-tracks-section" className="section-heading library-section-heading"><h2>Liked Tracks</h2><span className="section-note">{likedTracks.length} SONGS</span></div>
          {libraryQuery.trim()?renderRows(likedTracks.filter(track=>track.title.toLowerCase().includes(libraryQuery.trim().toLowerCase())||track.artist.toLowerCase().includes(libraryQuery.trim().toLowerCase()))):renderRows(likedTracks)}
          <div id="local-files-section" className="section-heading library-section-heading">
            <h2>Local Files</h2>
            <div className="library-local-actions">
              <button className="subtle-action" onClick={()=>fileRef.current?.click()}><Upload size={14}/> Add files</button>
              <button className="subtle-action" onClick={()=>{setImportUrl("");setImportPreview(null);setImportError("");setModal("import");}}><Link2 size={14}/> Paste link</button>
            </div>
          </div>
          {libraryQuery.trim()?renderRows(localTracks.filter(track=>track.title.toLowerCase().includes(libraryQuery.trim().toLowerCase())||track.artist.toLowerCase().includes(libraryQuery.trim().toLowerCase()))):renderRows(localTracks)}
        </>}
        {libraryViewMode==="grid"&&libraryFilter!=="all"&&(
          (libraryFilter==="playlists"&&state.playlists.length===0&&state.importedCollections.filter(item=>item.kind==="playlist").length===0)||
          (libraryFilter==="albums"&&state.importedCollections.filter(item=>item.kind==="album").length===0)||
          (libraryFilter==="artists"&&state.savedArtists.length===0)
        )&&<Empty title={`No ${libraryFilter} yet`} text="Items you add to your LYNE library will appear here."/>}
      </>}
      {tab==="Stats"&&<><div className="hero"><p className="eyebrow">YOUR LISTENING ACTIVITY</p><h1>Your stats</h1><p className="muted">A closer look at what you've been listening to.</p></div><div className="period-pills">{(["day","week","month","year"] as Period[]).map(p=><button className={period===p?"selected":""} onClick={()=>setPeriod(p)} key={p}>{({day:"Day",week:"Week",month:"Month",year:"Year"} as Record<Period,string>)[p]}</button>)}</div><div className="stat-card"><span>TOTAL MINUTES LISTENED</span><strong>{totalMinutes.toLocaleString()}</strong><small>{period==="day"?"Today":period==="week"?"Last 7 days":period==="month"?"This month":"This year"}</small></div><div className="section-heading"><h2>Top 10 songs</h2><span className="section-note">By listening time</span></div><Rankings items={ranking("title")}/><div className="section-heading"><h2>Top 10 artists</h2><span className="section-note">By listening time</span></div><Rankings items={ranking("artist")}/><button className="share-button" onClick={()=>void shareStats()}><Share2/> Share your stats</button>{wrappedStats.length>0&&<><div className="section-heading"><h2>LYNE Wrapped {wrappedYear}</h2><span className="section-note">YOUR YEAR IN MUSIC</span></div><div className="stat-card"><span>MINUTES LISTENED IN {wrappedYear}</span><strong>{wrappedMinutes.toLocaleString()}</strong><small>Your yearly LYNE recap</small><button className="subtle-action" onClick={()=>setWrappedOpen(value=>!value)}>{wrappedOpen?"Hide Wrapped":"View Wrapped"}</button></div>{wrappedOpen&&<><div className="section-heading"><h2>Top songs of {wrappedYear}</h2></div><Rankings items={wrappedRanking("title")}/><div className="section-heading"><h2>Top artists of {wrappedYear}</h2></div><Rankings items={wrappedRanking("artist")}/></>}</>}<p className="footnote">Listening time is recorded on this device. Account sync becomes available through the LYNE API.</p></>}
      {tab==="Profile"&&<><div className="profile-hero"><div className="profile-avatar">{state.profile.avatar?<img src={state.profile.avatar}/>:state.profile.name.slice(0,1).toUpperCase()}</div><p className="eyebrow">YOUR LYNE ACCOUNT</p><h1>{state.profile.name}</h1><p className="muted">{user?(`Signed in as @${user.username}`):"Personalize your listening space."}</p></div><button className="profile-option" onClick={()=>setModal("account")}><UserRound/><span><b>{user?"Account details":"Sign in or create account"}</b><small>Sync your LYNE music and settings</small></span><ChevronRight/></button>{user&&<button className="profile-option" onClick={()=>{setEditUsername(user.username);setModal("profileEdit");}}><Pencil/><span><b>Edit username</b><small>Change how your name appears in LYNE</small></span><ChevronRight/></button>}<label className="profile-option upload-avatar"><ImagePlus/><span><b>Change profile picture</b><small>{user?"Syncs to your LYNE account":"Saved on this device until you sign in"}</small></span><input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)void updateProfileAvatar(f);e.currentTarget.value="";}}/></label>{state.profile.avatar&&<button className="provider-open" onClick={()=>void removeProfileAvatar()}>Remove profile picture</button>}<button className="profile-option" onClick={()=>setModal("settings")}><Settings/><span><b>App settings</b><small>Appearance and playback preferences</small></span><ChevronRight/></button><button className="profile-option" onClick={()=>setTab("Stats")}><Clock3/><span><b>Listening stats</b><small>Your minutes, songs and artists</small></span><ChevronRight/></button><button className="profile-option" onClick={()=>{setModal("settings");setSettingsSection("Storage");}}><Download/><span><b>Downloads & offline</b><small>Manage music saved on this device</small></span><ChevronRight/></button>{user&&<button className="signout" onClick={logout}><LogOut/> Sign out</button>}</>}
    </section>
    {current&&state.preferences.miniPlayer&&<div className="mini-player" role="group" aria-label="Playback controls" onClick={()=>setExpanded(true)}><button className="mini-player-open" type="button" aria-label="Open now playing" onClick={()=>setExpanded(true)}><Cover track={current}/><span className="mini-copy"><b>{current.title}</b><small>{current.artist}</small></span></button><div className="mini-player-controls"><button className="plain-icon mini-transport" aria-label="Previous track" onClick={e=>{e.stopPropagation();previous();}}><SkipBack size={17}/></button><button className="plain-icon mini-play" aria-label={playing?"Pause playback":"Start playback"} onClick={e=>{e.stopPropagation();setPlaying(v=>!v);}}>{playing?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}</button><button className="plain-icon mini-transport" aria-label="Next track" onClick={e=>{e.stopPropagation();next();}}><SkipForward size={17}/></button></div><div className="mini-player-extras"><button className="plain-icon mini-extra" aria-label={state.likes.includes(current.id)?"Remove from liked songs":"Add to liked songs"} onClick={e=>{e.stopPropagation();toggleLike(current);}}><Heart size={16} fill={state.likes.includes(current.id)?"currentColor":"none"}/></button><button className="plain-icon mini-extra" aria-label="Open queue" onClick={e=>{e.stopPropagation();setModal("queue");}}><ListMusic size={16}/></button></div><div className="mini-progress"><span style={{width:duration>0?`${Math.min(100,position/duration*100)}%`:"0%"}}/></div></div>}
    <nav className="app-dock windows-sidebar" aria-label="Main navigation">
      {([{id:"Home",icon:WindowsHomeIcon},{id:"Search",icon:WindowsSearchIcon},{id:"Library",icon:WindowsLibraryIcon}] as const).map(({id,icon:Icon})=><button key={id} type="button" title={id} aria-label={id} aria-current={tab===id?"page":undefined} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={26}/></button>)}
      <span className="sidebar-spacer"/>
      <button type="button" title="Settings" aria-label="Settings" className="settings-nav-button" onClick={()=>setModal("settings")}><WindowsSettingsIcon size={26}/></button>
    </nav>
    {expanded&&current&&<div className={`player-overlay ambient-${state.preferences.ambientVisualMode}`} onTouchStart={handlePlayerTouchStart} onTouchEnd={handlePlayerTouchEnd}><div className="player-art-backdrop" style={{backgroundColor:`rgb(${ambientColor})`,...(current.artwork?{backgroundImage:`url("${current.artwork}")`}:{})}}/><div className="player-top"><button className="plain-icon" aria-label="Minimize player" onClick={()=>setExpanded(false)}><Minimize2/></button><span>NOW PLAYING</span><div className="player-top-actions"><button className="plain-icon" aria-label="Open equalizer" onClick={()=>setModal("equalizer")}><SlidersHorizontal/></button><button className="plain-icon" aria-label="Open play queue" onClick={()=>setModal("queue")}><ListMusic/></button></div></div><Cover track={current} className="player-cover"/><div className="player-track"><div><h2>{current.title}</h2><p>{current.artist}</p><small className="audio-source-label">{getAudioSourceQuality(current).label}</small></div><button className={state.likes.includes(current.id)?"liked plain-icon":"plain-icon"} onClick={()=>toggleLike(current)}><Heart fill={state.likes.includes(current.id)?"currentColor":"none"}/></button></div><input className="seek" type="range" min="0" max={duration||100} value={Math.min(position,duration||100)} onChange={e=>{const v=Number(e.target.value);setPosition(v);if(audioRef.current)audioRef.current.currentTime=v/1000;}}/><div className="time-row"><span>{fmtTime(position)}</span><span>{fmtTime(duration)}</span></div><div className="transport"><button aria-label={shuffle?"Turn shuffle off":"Turn shuffle on"} className={shuffle?"control-on":"plain-icon"} onClick={()=>setShuffle(v=>!v)}><Shuffle/></button><button aria-label="Previous track" className="plain-icon large-control" onClick={previous}><SkipBack fill="currentColor"/></button><button aria-label={playing?"Pause playback":"Start playback"} className="main-play" onClick={()=>setPlaying(v=>!v)}>{playing?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}</button><button aria-label="Next track" className="plain-icon large-control" onClick={next}><SkipForward fill="currentColor"/></button><button aria-label={"Repeat "+state.repeat} className={state.repeat!=="off"?"control-on":"plain-icon"} onClick={()=>setState(s=>({...s,repeat:s.repeat==="off"?"all":s.repeat==="all"?"one":"off"}))}><Repeat2/></button></div><div className="volume-row"><Volume2 size={17}/><input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/><button className="plain-icon" onClick={()=>setModal("lyrics")}><Mic2/></button></div></div>}
    {modal&&<div className={modal==="artistDetail"||modal==="albumDetail"||modal==="publicPlaylistDetail"?"modal-backdrop artist-page-backdrop":"modal-backdrop"} role="presentation" onClick={()=>setModal(null)}><div className={`modal ${modal==="settings"?"modal-settings":modal==="artistDetail"?"artist-page-modal":modal==="albumDetail"||modal==="publicPlaylistDetail"?"liner-collection-modal":""}`} ref={modalDialogRef} role="dialog" aria-modal="true" aria-labelledby="lyne-dialog-title" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2 id="lyne-dialog-title">{modal==="playlist"?"Create playlist":modal==="playlistDetail"?(selectedPlaylist?.name||"Playlist"):modal==="track"?"Song options":modal==="artistDetail"?(artistDetail?.artist.name||"Artist"):modal==="albumDetail"?(albumDetail?.album.title||"Album"):modal==="publicPlaylistDetail"?(publicPlaylistDetail?.playlist.name||"Playlist"):modal==="account"?"LYNE account":modal==="profileEdit"?"Edit username":modal==="settings"?"Settings":modal==="queue"?"Play queue":modal==="equalizer"?"Equalizer":modal==="import"?"Import music":modal==="collection"?(activeCollection?.title||"Collection"):"Lyrics"}</h2><button ref={modalCloseRef} type="button" className="plain-icon" aria-label="Close dialog" onClick={()=>setModal(null)}><X/></button></div>
      {detailError&&<div className="detail-error" role="alert"><p>{detailError}</p><button className="secondary-action" onClick={()=>detailRetryRef.current?.()}>Try again</button></div>}
      {modal==="artistDetail"&&<>{detailBusy?<div className="loading"><LoaderCircle className="spin"/> Loading artist...</div>:artistDetail&&<><div className="music-detail-hero"><div className="music-detail-art artist-detail-art" style={artistDetail.artist.artwork?{backgroundImage:`url("${artistDetail.artist.artwork}")`}:undefined}>{!artistDetail.artist.artwork&&<UserRound size={30}/>}</div><div><p className="eyebrow">ARTIST</p><h3>{artistDetail.artist.name}{artistDetail.artist.verified&&<span className="artist-verified"><Check size={15}/></span>}</h3><small>{artistDetail.artist.monthlyListeners||(artistDetail.artist.followers?`${artistDetail.artist.followers.toLocaleString()} followers`:`${artistDetail.tracks.length} tracks · ${artistDetail.albums.length} albums`)}</small></div></div><div className="artist-detail-actions"><button className="primary-button" disabled={!artistDetail.tracks.length} onClick={()=>{if(artistDetail.tracks[0])play(artistDetail.tracks[0],artistDetail.tracks);}}><Play size={15} fill="currentColor"/> Play all</button><button className="secondary-action" disabled={!artistDetail.tracks.length} onClick={()=>{const tracks=[...artistDetail.tracks];for(let i=tracks.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tracks[i],tracks[j]]=[tracks[j],tracks[i]];}if(tracks[0])play(tracks[0],tracks);}}><Shuffle size={15}/> Shuffle</button><button className="secondary-action" onClick={()=>toggleSavedArtist(artistDetail.artist)}>{state.savedArtists.some(item=>item.id===artistDetail.artist.id)?<Check size={15}/>:<Plus size={15}/>} {state.savedArtists.some(item=>item.id===artistDetail.artist.id)?"Saved":"Save artist"}</button><button className="secondary-action" onClick={()=>void shareArtist(artistDetail.artist)}><Share2 size={15}/> Share</button></div>{artistDetail.artist.bio&&<p className="detail-description">{artistDetail.artist.bio}</p>}<div className="section-heading"><h2>Popular tracks</h2><span className="section-note">TOP SONGS</span></div>{renderRows(artistDetail.tracks)}{artistDetail.albums.length>0&&<><div className="section-heading"><h2>Albums</h2></div><div className="detail-album-grid">{artistDetail.albums.map(album=><button className="detail-album-card" key={album.id} onClick={()=>void openAlbum(album.id)}><div className="cover" style={album.artwork?{backgroundImage:`url("${album.artwork}")`}:undefined}>{!album.artwork&&<Disc3/>}</div><b>{album.title}</b><small>{album.releaseDate||"Album"}</small></button>)}</div></>}</>}</>}
      {modal==="albumDetail"&&<>{detailBusy?<div className="loading"><LoaderCircle className="spin"/> Loading album...</div>:albumDetail&&<><div className="music-detail-hero"><div className="music-detail-art" style={albumDetail.album.artwork?{backgroundImage:`url("${albumDetail.album.artwork}")`}:undefined}>{!albumDetail.album.artwork&&<Disc3 size={30}/>}</div><div><p className="eyebrow">ALBUM</p><h3>{albumDetail.album.title}</h3><small>{albumDetail.album.artist}{albumDetail.album.releaseDate?" · "+albumDetail.album.releaseDate:""}</small></div></div><button className="primary-button" onClick={()=>{if(albumDetail.tracks[0])play(albumDetail.tracks[0],albumDetail.tracks);}}> <Play size={14} fill="currentColor"/> Play album</button><div className="section-heading"><h2>Tracks</h2><span className="section-note">{albumDetail.tracks.length} SONGS</span></div>{renderRows(albumDetail.tracks)}</>}</>}
      {modal==="publicPlaylistDetail"&&<>{detailBusy?<div className="loading"><LoaderCircle className="spin"/> Loading playlist...</div>:publicPlaylistDetail&&<><div className="playlist-detail-hero"><div className="playlist-detail-art" style={publicPlaylistDetail.playlist.cover?{backgroundImage:`url("${publicPlaylistDetail.playlist.cover}")`}:undefined}>{!publicPlaylistDetail.playlist.cover&&<ListMusic size={34}/>}</div><div><p className="eyebrow">LYNE PLAYLIST</p><h3>{publicPlaylistDetail.playlist.name}</h3><small>By {publicPlaylistDetail.playlist.owner} · {publicPlaylistDetail.tracks.length} tracks</small></div></div>{publicPlaylistDetail.playlist.description&&<p className="detail-description">{publicPlaylistDetail.playlist.description}</p>}<button className="primary-button" disabled={!publicPlaylistDetail.tracks.length} onClick={()=>{if(publicPlaylistDetail.tracks[0])play(publicPlaylistDetail.tracks[0],publicPlaylistDetail.tracks);}}><Play size={14} fill="currentColor"/> Play playlist</button><div className="section-heading"><h2>Tracks</h2><span className="section-note">{publicPlaylistDetail.tracks.length} SONGS</span></div>{renderRows(publicPlaylistDetail.tracks)}{!publicPlaylistDetail.tracks.length&&<Empty title="No playable tracks" text="This playlist has no published LYNE catalogue tracks yet."/ >}</>}</>}
      {modal==="playlistDetail"&&selectedPlaylist&&<><div className="playlist-detail-hero"><div className="playlist-detail-art" style={selectedPlaylist.cover?{backgroundImage:`url("${selectedPlaylist.cover}")`}:undefined}>{!selectedPlaylist.cover&&<ListMusic size={34}/>}</div><div><p className="eyebrow">YOUR PLAYLIST</p><h3>{selectedPlaylist.name}</h3><small>{selectedPlaylist.trackIds.length} tracks · On this device</small></div></div><label className="field-label">Playlist name<input value={editPlaylistName} onChange={e=>setEditPlaylistName(e.target.value)} maxLength={80}/></label><label className="field-label">Description<textarea value={editPlaylistDescription} onChange={e=>setEditPlaylistDescription(e.target.value)} maxLength={500} rows={3} placeholder="Add a description to your playlist"/></label><div className="playlist-manage-actions"><button className="primary-button" onClick={savePlaylistName}><Pencil size={15}/> Save playlist</button><button className="secondary-action" onClick={()=>playlistCoverRef.current?.click()}><ImagePlus size={15}/> Change artwork</button><button className="secondary-action" onClick={()=>void removePlaylistCover(selectedPlaylist)}><X size={15}/> Remove artwork</button><input ref={playlistCoverRef} hidden type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(file)void setPlaylistCover(file);e.currentTarget.value="";}}/></div><div className="section-heading"><h2>Playlist tracks</h2><span className="section-note">{selectedPlaylistTracks.length} available here</span></div>{selectedPlaylist.trackIds.length?<div className="playlist-track-list">{selectedPlaylist.trackIds.map((id,index)=>{const track=allTracks.find(t=>t.id===id);if(!track)return <div className="playlist-missing" key={id}><span>Track unavailable on this device</span><button className="plain-icon" onClick={()=>removePlaylistTrack(selectedPlaylist,id)} aria-label="Remove unavailable track"><X size={16}/></button></div>;return <div className="playlist-manage-row" key={id}><button className="playlist-manage-play" onClick={()=>play(track,selectedPlaylistTracks)}><Cover track={track}/><span><b>{track.title}</b><small>{track.artist}</small></span></button><button className="plain-icon" disabled={index===0} onClick={()=>movePlaylistTrack(selectedPlaylist,index,-1)} aria-label="Move track up"><ChevronUp size={17}/></button><button className="plain-icon" disabled={index===selectedPlaylist.trackIds.length-1} onClick={()=>movePlaylistTrack(selectedPlaylist,index,1)} aria-label="Move track down"><ChevronDown size={17}/></button><button className="plain-icon" onClick={()=>removePlaylistTrack(selectedPlaylist,id)} aria-label="Remove track"><X size={17}/></button></div>;})}</div>:<Empty title="This playlist is empty" text="Use the more menu beside any track and choose Add to playlist to build this collection."/>}<button className="danger-action playlist-delete" onClick={()=>deletePlaylist(selectedPlaylist)}><Trash2 size={15}/> Delete playlist</button></>}
      {modal==="track"&&activeTrack&&<>{(activeTrack.source==="local"||activeTrack.offline)&&<button className="danger-action" onClick={()=>void deleteLocalTrack(activeTrack)}><Trash2 size={15}/> Remove file from this device</button>}{activeTrack.source!=="local"&&!activeTrack.offline&&activeTrack.audioUrl&&<button className="secondary-action full-action" disabled={offlineBusy} onClick={()=>void downloadTrackOffline(activeTrack)}>{offlineBusy?<LoaderCircle size={15} className="spin"/>:<Download size={15}/>} {offlineBusy?"Saving for offline...":"Save for offline"}</button>}{activeTrack.offline&&<p className="settings-note">Saved on this device for offline playback.</p>}<div className="track-action-heading"><Cover track={activeTrack} className="track-action-cover"/><div><b>{activeTrack.title}</b><small>{activeTrack.artist}</small></div></div>{activeTrack.source==="local"&&<>{!localMetaEdit?<button className="secondary-action full-action" onClick={()=>beginLocalMetadataEdit(activeTrack)}><Pencil size={15}/> Edit local track details</button>:<div className="local-meta-form"><label className="field-label">Title<input maxLength={160} value={localMetaEdit.title} onChange={e=>setLocalMetaEdit(old=>old?{...old,title:e.target.value}:old)}/></label><label className="field-label">Artist<input maxLength={160} value={localMetaEdit.artist} onChange={e=>setLocalMetaEdit(old=>old?{...old,artist:e.target.value}:old)}/></label><label className="field-label">Album<input maxLength={160} value={localMetaEdit.album} onChange={e=>setLocalMetaEdit(old=>old?{...old,album:e.target.value}:old)}/></label><button className="secondary-action full-action" onClick={()=>localArtworkRef.current?.click()}><ImagePlus size={15}/> {localMetaEdit.artwork?"Change artwork":"Add artwork"}</button><input ref={localArtworkRef} hidden type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(file)void resizePlaylistImage(file).then(artwork=>setLocalMetaEdit(old=>old?{...old,artwork}:old)).catch(()=>setNotice("Could not use that artwork."));e.currentTarget.value="";}}/>{localMetaEdit.artwork&&<><div className="local-art-preview" style={{backgroundImage:`url("${localMetaEdit.artwork}")`}}/><button className="provider-open" onClick={()=>setLocalMetaEdit(old=>old?{...old,artwork:""}:old)}>Remove artwork</button></>}<button className="primary-button" onClick={()=>void saveLocalMetadata()}>Save track details</button><button className="provider-open" onClick={()=>setLocalMetaEdit(undefined)}>Cancel editing</button></div>}</>}<button className="primary-button" onClick={()=>{play(activeTrack,[activeTrack,...queue.filter(t=>t.id!==activeTrack.id)]);setModal(null);}}>Play now</button><button className="secondary-action full-action" onClick={()=>addNext(activeTrack)}><ListPlus size={16}/> Play next</button><div className="section-heading"><h2>Add to playlist</h2></div>{state.playlists.length?state.playlists.map(playlist=><button className="playlist-pick-row" key={playlist.id} onClick={()=>addToPlaylist(playlist,activeTrack)}><div className="library-art playlist-art" style={playlist.cover?{backgroundImage:`url("${playlist.cover}")`,backgroundSize:"cover",backgroundPosition:"center"}:undefined}>{!playlist.cover&&<ListMusic/>}</div><span><b>{playlist.name}</b><small>{playlist.trackIds.length} tracks</small></span><Plus size={16}/></button>):<Empty title="No playlists yet" text="Create a playlist in your Library, then add songs here."/>}{state.importedCollections.length>0&&<><div className="section-heading"><h2>Add to imported collection</h2></div>{state.importedCollections.map(collection=><button className="playlist-pick-row" key={collection.provider+collection.providerId+collection.kind} onClick={()=>addTrackToImportedCollection(collection,activeTrack)}><div className="library-art playlist-art"><ListMusic/></div><span><b>{collection.title}</b><small>{collection.kind==="album"?"Imported album":"Imported playlist"} · {(collection.tracks?.length||0)+(collection.addedTracks?.length||0)} tracks</small></span><Plus size={16}/></button>)}</>}
      </>}
      {modal==="collection"&&activeCollection&&<><div className="import-preview-main"><div className="cover" style={activeCollection.artwork?{backgroundImage:`url("${activeCollection.artwork}")`}:undefined}><ListMusic/></div><div><b>{activeCollection.title}</b><small>{activeCollection.subtitle}</small><small>{providerName(activeCollection.provider)} · {activeCollection.kind}</small></div></div><div className="collection-actions"><button className="primary-button" disabled={!activeCollection.embedUrl} onClick={()=>openImportedPlayback(activeCollection)}><Play size={14}/> Play with {providerName(activeCollection.provider)}</button><button className="secondary-action full-action" disabled={importSaving} onClick={()=>void likeAllImportedTracks(activeCollection)}>{importSaving?"Adding tracks...":"Add all tracks to Liked Songs ("+(activeCollection.tracks?.length||0)+")"}</button>{activeCollection.addedTracks?.length?<button className="secondary-action full-action" onClick={()=>{const tracks=activeCollection.addedTracks||[];if(tracks[0])play(tracks[0],tracks);}}><Play size={14}/> Play added LYNE tracks ({activeCollection.addedTracks.length})</button>:null}<button className="provider-open" onClick={()=>window.open(activeCollection.externalUrl,"_blank","noopener,noreferrer")}>Open original {providerName(activeCollection.provider)} <ExternalLink size={14}/></button></div><div className="track-list imported-track-list">{(activeCollection.tracks||[]).map(track=><div className="external-track" key={track.providerId}><button className="external-track-main" onClick={()=>openImportedPlayback({provider:activeCollection.provider,title:track.title,subtitle:track.artist,externalUrl:track.externalUrl,embedUrl:track.embedUrl,artwork:track.artwork})}><div className="cover" style={track.artwork?{backgroundImage:`url("${track.artwork}")`}:undefined}>{!track.artwork&&<Music2/>}</div><span><b>{track.title}</b><small>{track.artist}</small></span><Play size={14}/></button><button className="plain-icon" aria-label="Add to liked songs" onClick={()=>likeImportedTrack(activeCollection,track)}><Heart size={17}/></button></div>)}</div>{!activeCollection.tracks?.length&&<Empty title="No provider track list" text="This provider did not expose a full track list. Add LYNE catalogue songs below to build this collection."/>}<div className="section-heading"><h2>LYNE tracks added</h2><span className="section-note">{activeCollection.addedTracks?.length||0} saved here</span></div>{activeCollection.addedTracks?.length?renderRows(activeCollection.addedTracks):<Empty title="No LYNE songs added" text="Use a track's more menu and choose this imported collection to add songs to it."/>}</>}
      {modal==="import"&&<><p className="import-help">Paste a song, playlist or album link. LYNE will look it up using the provider's official API.</p><label className="field-label">Music link<input autoFocus value={importUrl} onChange={e=>{setImportUrl(e.target.value);setImportPreview(null);setImportError("");}} placeholder="Paste Spotify, SoundCloud, YouTube or Apple Music link" inputMode="url"/></label><button className="primary-button" onClick={()=>void resolveImportLink()} disabled={!importUrl.trim()||importBusy}>{importBusy?"Looking up link...":"Review link"}</button>{importError&&<p className="import-error">{importError}</p>}{importPreview&&<div className="import-preview"><div className="import-preview-main"><div className="cover" style={importPreview.artwork?{backgroundImage:`url("${importPreview.artwork}")`}:undefined}>{!importPreview.artwork&&<Music2/>}</div><div><b>{importPreview.title}</b><small>{importPreview.subtitle}</small><small>{providerName(importPreview.provider)} · {importPreview.kind}</small></div></div><p>{importPreview.kind==="track"?"This song will be added to Liked Songs.":`This ${importPreview.kind} will be added to your Library.`} {importPreview.tracks.length? `${importPreview.tracks.length} track references found.`:""}</p><button className="primary-button" disabled={importSaving} onClick={()=>void saveImportedLink()}>{importSaving?"Saving...":importPreview.kind==="track"?"Add to Liked Songs":"Add to Library"}</button><button className="provider-open" onClick={()=>window.open(importPreview.externalUrl,"_blank","noopener,noreferrer")}>Open in {providerName(importPreview.provider)} <ExternalLink size={14}/></button></div>}<p className="modal-note">Supported: Spotify, SoundCloud, YouTube and Apple Music. Imported links are saved as library references; LYNE does not use provider preview players. Full playlist and album track lists still depend on the provider's official API access. Imported items keep their original source link. SoundCloud can play in LYNE through its official API when the backend credentials are configured and the track offers a full-length stream. YouTube links import metadata; playback uses an exact LYNE catalogue match or a local licensed audio file, not a YouTube embed or preview.</p></>}
      {modal==="playlist"&&<><label className="field-label">Playlist name<input autoFocus value={playlistName} onChange={e=>setPlaylistName(e.target.value)} placeholder="My playlist"/></label><button className="primary-button" onClick={createPlaylist} disabled={!playlistName.trim()}>Create playlist</button></>}
      {modal==="profileEdit"&&<><p className="modal-note">Your username is shown on your LYNE profile and public playlists. Use 3–24 letters, numbers or underscores.</p><label className="field-label">Username<input value={editUsername} onChange={e=>setEditUsername(e.target.value)} maxLength={24} autoComplete="username"/></label><button className="primary-button" disabled={profileUpdateBusy||!editUsername.trim()} onClick={()=>void saveUsername()}>{profileUpdateBusy?"Saving...":"Save username"}</button></>}
      {modal==="equalizer"&&<><div className="eq-topline"><div><b>10-band equalizer</b><small>Shape the sound band by band</small></div><button type="button" className={state.preferences.equalizerEnabled?"toggle on":"toggle"} aria-label="Enable equalizer" aria-pressed={state.preferences.equalizerEnabled} onClick={()=>void toggleEqualizer(!state.preferences.equalizerEnabled)}/></div><div className="eq-tabs">{([...EQ_PRESET_CATEGORIES,"custom"] as EqualizerCategory[]).map(tab=><button key={tab} type="button" className={equalizerTab===tab?"active":""} onClick={()=>setEqualizerTab(tab)}>{({enhance:"Enhance",genre:"Genres",accent:"Accents",custom:"Mine"} as Record<EqualizerCategory,string>)[tab]}</button>)}</div>{equalizerTab!=="custom"?<div className="eq-preset-grid">{EQ_PRESETS.filter(preset=>preset.category===equalizerTab).map(preset=><button key={preset.id} type="button" className={state.preferences.equalizerEnabled&&state.preferences.equalizerPreset===preset.id?"active":""} onClick={()=>setEqualizerPreset(preset)}>{EQ_PRESET_LABELS[preset.id]}</button>)}</div>:<div className="eq-custom-panel">{state.preferences.equalizerCustomPresets.length>0?<div className="eq-preset-grid">{state.preferences.equalizerCustomPresets.map(preset=><div className="eq-custom-preset" key={preset.id}><button type="button" className={state.preferences.equalizerPreset===preset.id?"active":""} onClick={()=>applyEqualizerGains(preset.gains,preset.id,"custom")}>{preset.name}</button><button type="button" className="eq-delete-preset" aria-label={"Delete "+preset.name} onClick={()=>deleteEqualizerPreset(preset.id)}><X size={13}/></button></div>)}</div>:<p className="eq-note">Tune the bands and save a curve to reuse it later.</p>}<div className="eq-save-row"><input aria-label="Preset name" maxLength={EQ_PRESET_NAME_MAX} value={equalizerPresetName} onChange={e=>setEqualizerPresetName(e.target.value)} placeholder="Preset name"/><button type="button" disabled={!equalizerPresetName.trim()||state.preferences.equalizerCustomPresets.length>=EQ_MAX_CUSTOM_PRESETS} onClick={saveEqualizerPreset}>Save current</button></div></div>}<div className="eq-scale"><span>+12 dB</span><span>0 dB</span><span>−12 dB</span></div><div className={"eq-bands"+(state.preferences.equalizerEnabled?"":" is-disabled")}>{EQ_FREQUENCIES.map((frequency,index)=><label className="eq-band" key={frequency}><span>{Number(state.preferences.equalizerBands[index]||0)>0?"+":""}{Number(state.preferences.equalizerBands[index]||0).toFixed(1).replace(/\.0$/,"")}</span><input className="eq-slider" aria-label={frequency+" Hz equalizer band"} type="range" min="-12" max="12" step="0.5" value={Number(state.preferences.equalizerBands[index]||0)} disabled={!state.preferences.equalizerEnabled} onChange={e=>{const gains=state.preferences.equalizerBands.map((value,bandIndex)=>bandIndex===index?clampEqGain(Number(e.target.value)):value);applyEqualizerGains(gains,"custom","custom");}}/><small>{EQ_LABELS[index]}</small></label>)}</div>{equalizerError&&<p className="import-error" role="alert">{equalizerError}</p>}<p className="eq-note">EQ curves, frequency bands and gain range match the Windows LYNE equalizer. Boosts are automatically pre-attenuated to help prevent clipping.</p><button className="secondary-action full-action" type="button" onClick={()=>applyEqualizerGains(FLAT_EQ,"flat","enhance")}>Reset to flat</button></>}
       {modal==="account"&&<><div className="filter-pills"><button className={accountMode==="login"?"selected":""} onClick={()=>setAccountMode("login")}>Sign in</button><button className={accountMode==="register"?"selected":""} onClick={()=>setAccountMode("register")}>Create account</button></div><label className="field-label">Username<input value={accountName} onChange={e=>setAccountName(e.target.value)} autoComplete="username"/></label>{accountMode==="register"&&<label className="field-label">Email<input value={accountEmail} onChange={e=>setAccountEmail(e.target.value)} type="email" autoComplete="email"/></label>}<label className="field-label">Password<input value={accountPassword} onChange={e=>setAccountPassword(e.target.value)} type="password" autoComplete={accountMode==="login"?"current-password":"new-password"}/></label><button className="primary-button" onClick={()=>void submitAccount()}>{accountMode==="login"?"Sign in":"Create account"}</button>{accountMessage&&<p className="modal-note">{accountMessage}</p>}</>}
      {modal==="settings"&&<div className="settings-layout">
        <div className="settings-tabs">{(["Profile","Playback","Listening","Shortcuts","Appearance","Overlay","Connections","YouTube","Discord","Storage","About"] as const).map(item=><button key={item} className={settingsSection===item?"active":""} onClick={()=>{setSettingsSection(item);if(item==="Connections")void loadProviderStatus();}}>{item}</button>)}</div>
        <div className="settings-content">
          {settingsSection==="Profile"&&<><div className="settings-section-title">Profile</div><div className="settings-profile-summary"><div className="profile-avatar">{state.profile.avatar?<img src={state.profile.avatar} alt=""/>:state.profile.name.slice(0,1).toUpperCase()}</div><div><b>{state.profile.name}</b><small>{user?("@"+user.username):"Saved on this device"}</small></div></div><div className="capability-note"><b>LYNE account</b><p>Your profile picture, username and account details live in your LYNE profile. Open the profile page to edit them.</p></div><button className="secondary-action full-action" onClick={()=>{setModal(null);setTab("Profile");}}>Manage profile <ChevronRight size={15}/></button></>}
          {settingsSection==="Listening"&&<><div className="settings-section-title">Total Minutes Listened</div><div className="period-pills">{(["day","week","month","year"] as Period[]).map(p=><button className={period===p?"selected":""} onClick={()=>setPeriod(p)} key={p}>{({day:"Day",week:"Week",month:"Month",year:"Year"} as Record<Period,string>)[p]}</button>)}</div><div className="stat-card"><span>TOTAL MINUTES LISTENED</span><strong>{totalMinutes.toLocaleString()}</strong><small>{period==="day"?"Today":period==="week"?"Last 7 days":period==="month"?"This month":"This year"}</small></div><div className="section-heading"><h2>Top 10 songs</h2></div><Rankings items={ranking("title")}/><div className="section-heading"><h2>Top 10 artists</h2></div><Rankings items={ranking("artist")}/><button className="secondary-action full-action" onClick={()=>{setModal(null);setTab("Stats");}}>Open full listening stats <ChevronRight size={15}/></button></>}
          {settingsSection==="Appearance"&&<><div className="settings-section-title">Appearance</div><div className="setting-line"><span><b>Theme</b><small>Choose how LYNE looks on this device</small></span><select value={state.theme} onChange={e=>setState(s=>({...s,theme:e.target.value}))}><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></div><div className="capability-note"><b>Language</b><p>LYNE Mobile is currently available in English. Additional translations are not included yet.</p></div><SettingToggle title="Reduce motion" description="Prefer simpler transitions and animations" checked={state.preferences.reduceMotion} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,reduceMotion:v}}))}/><div className="setting-line"><span><b>Player ambient visuals</b><small>Match the now-playing backdrop to album artwork</small></span><select value={state.preferences.ambientVisualMode} onChange={e=>setState(s=>({...s,preferences:{...s.preferences,ambientVisualMode:e.target.value as "soft"|"glow"|"off"} }))}><option value="soft">Soft</option><option value="glow">Glow</option><option value="off">Off</option></select></div><div className="setting-line"><span><b>Custom background</b><small>Use a photo from your device behind LYNE. It stays saved on this device.</small></span><button className="secondary-action" onClick={()=>backgroundFileRef.current?.click()}>Choose image</button><input ref={backgroundFileRef} hidden type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(file)void resizeBackgroundImage(file).then(image=>{try{localStorage.setItem("lyne.mobile.background",image);setCustomBackground(image);setNotice("Custom background saved.");}catch{setNotice("That image is too large to save on this device.");}}).catch(()=>setNotice("Could not use that image."));e.currentTarget.value="";}}/></div>{customBackground&&<button className="provider-open" onClick={()=>{localStorage.removeItem("lyne.mobile.background");setCustomBackground("");setNotice("Custom background removed.");}}>Remove custom background</button>}</>}
          {settingsSection==="Playback"&&<><div className="settings-section-title">Playback</div><div className="setting-line"><span><b>Master volume</b><small>Set LYNE playback volume</small></span><input aria-label="Master volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))} style={{width:120}}/></div><div className="setting-line"><span><b>Playback speed</b><small>Adjust the speed of the current and future tracks</small></span><select value={playbackRate} onChange={e=>setPlaybackRate(Number(e.target.value))}><option value={0.5}>0.50×</option><option value={0.75}>0.75×</option><option value={1}>1.00×</option><option value={1.25}>1.25×</option><option value={1.5}>1.50×</option><option value={1.75}>1.75×</option><option value={2}>2.00×</option></select></div><div className="setting-line"><span><b>Audio output</b><small>Choose the output from your phone system audio controls</small></span><span className="status-pill">System</span></div><div className="setting-line"><span><b>Audio quality</b><small>Use the original audio source. Lossless only plays verified FLAC, WAV or ALAC files.</small></span><select value={state.preferences.audioQuality} onChange={e=>setState(old=>({...old,preferences:{...old.preferences,audioQuality:e.target.value as "auto"|"lossless"}}))}><option value="auto">Auto · Original source</option><option value="lossless">Lossless only</option></select></div><SettingToggle title="Autoplay similar music" description="Continue with similar tracks when your queue ends" checked={state.preferences.autoplaySimilar} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,autoplaySimilar:v}}))}/><div className="setting-line"><span><b>Tap a track</b><small>Choose what happens when selecting a track</small></span><select value={state.preferences.trackTapBehavior} onChange={e=>setState(s=>({...s,preferences:{...s.preferences,trackTapBehavior:e.target.value as "play"|"queue"}}))}><option value="play">Play now</option><option value="queue">Add to queue</option></select></div><div className="setting-line"><span><b>When opening LYNE</b><small>Choose how playback starts</small></span><select value={state.preferences.defaultPlaybackContext} onChange={e=>setState(s=>({...s,preferences:{...s.preferences,defaultPlaybackContext:e.target.value as "resume"|"empty"}}))}><option value="resume">Resume last queue</option><option value="empty">Start with an empty queue</option></select></div><div className="capability-note"><b>Calls and audio interruptions</b><p>Your phone and browser handle calls, alarms and audio-focus interruptions. Installed PWAs cannot reliably observe every Bluetooth route or system audio-focus change, so LYNE cannot promise a separate pause-on-interruption switch here.</p></div><div className="setting-line"><span><b>Repeat</b><small>Playback repeat mode</small></span><select value={state.repeat} onChange={e=>setState(s=>({...s,repeat:e.target.value as typeof s.repeat}))}><option value="off">Off</option><option value="all">Repeat all</option><option value="one">Repeat one</option></select></div><SettingToggle title="Shuffle" description="Randomize the play queue" checked={shuffle} onChange={setShuffle}/><div className="setting-line"><span><b>Equalizer</b><small>Adjust 10 frequency bands and save your preferred sound profile</small></span><button className="secondary-action" type="button" onClick={()=>setModal("equalizer")}><SlidersHorizontal size={15}/> Open EQ</button></div><div className="capability-note"><b>Audio interruptions and output routing</b><p>Call, alarm and Bluetooth routing behavior is controlled by the mobile operating system and browser. LYNE exposes supported headset and lock-screen controls, but cannot force an output device from a PWA.</p></div></>}
          {settingsSection==="Storage"&&<><div className="settings-section-title">Storage</div><div className="storage-card"><b>{storageUsed===null?"Storage usage unavailable":(storageUsed/1024/1024).toFixed(1)+" MB used"}</b><small>Browser storage estimate for LYNE on this device.</small><button className="provider-open" onClick={()=>void refreshStorage()}>Refresh usage</button></div><div className="storage-card"><b>{localTracks.filter(track=>track.offline).length} offline catalogue tracks</b><small>{(localTracks.filter(track=>track.offline).reduce((sum,track)=>sum+(track.audioSize||0),0)/1024/1024).toFixed(1)} MB of LYNE catalogue audio saved on this device. Remove a saved track from its more menu to free space.</small></div><div className="setting-line"><span><b>Cache limit</b><small>Preferred maximum app cache size</small></span><select value={state.preferences.cacheLimitMb} onChange={e=>setState(s=>({...s,preferences:{...s.preferences,cacheLimitMb:Number(e.target.value)}}))}><option value={100}>100 MB</option><option value={250}>250 MB</option><option value={500}>500 MB</option><option value={1000}>1 GB</option></select></div><button className="danger-action" onClick={()=>void clearCache()}>Clear cached app files</button><p className="settings-note">The cache limit also caps catalogue tracks saved offline. Clearing temporary cache keeps offline audio, playlists, liked songs, profile and listening stats.</p></>}
          {settingsSection==="Shortcuts"&&<><div className="settings-section-title">Mobile controls</div><SettingToggle title="Touch gestures" description="Enable swipe gestures in the player where supported" checked={state.preferences.touchGestures} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,touchGestures:v}}))}/><SettingToggle title="Haptic feedback" description="Use vibration feedback for supported touch actions" checked={state.preferences.haptics} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,haptics:v}}))}/><div className="capability-note"><b>Keyboard shortcuts</b><p>Desktop-wide keyboard shortcuts are replaced on mobile by touch controls, supported headset buttons, and the device media controls. Browser and operating-system support varies.</p></div></>}
          {settingsSection==="Overlay"&&<><div className="settings-section-title">Player overlay</div><SettingToggle title="Show mini-player" description="Keep playback controls visible above the bottom navigation" checked={state.preferences.miniPlayer} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,miniPlayer:v}}))}/><div className="capability-note"><b>Picture-in-picture and lock-screen controls</b><p>These depend on browser and operating-system media-session support. LYNE will use the native controls available to the installed PWA; it cannot draw a desktop-style floating overlay above other apps.</p></div></>}
          {settingsSection==="Discord"&&<><div className="settings-section-title">Discord</div><div className="capability-note"><b>Discord Rich Presence isn't available in mobile browsers</b><p>The Windows desktop integration uses native desktop capabilities that an installed PWA cannot access. These settings will become active only if Discord provides a supported mobile integration.</p></div><SettingToggle title="Enable playback status preference" description="Remember your preference for a future supported integration" checked={state.preferences.discordPresence} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,discordPresence:v}}))}/></>}
          {settingsSection==="Connections"&&<><div className="settings-section-title">Provider API status</div><p className="settings-note">These statuses only report backend metadata API keys, not personal account sign-ins. SoundCloud full-length playback uses the official API when backend credentials are configured and the track allows streaming. YouTube links import metadata; playback requires a matching LYNE catalogue recording or local licensed audio file.</p>{providerStatusError&&<p className="import-error" role="alert">{providerStatusError}</p>}{(["spotify","soundcloud","youtube","apple_music"] as const).map(provider=><div className="setting-line" key={provider}><span><b>{providerName(provider)}</b><small>{providerStatus?.[provider]?.configured?"Backend API credentials detected":provider==="soundcloud"?"LYNE can initialize the public SoundCloud API when needed.":"No backend API key detected"}</small></span><span className={"status-pill "+(providerStatus?.[provider]?.configured?"online":"offline")}>{providerStatus?.[provider]?.configured?"API ready":provider==="soundcloud"?"Public API fallback":providerStatus?"Needs API key":"Unknown"}</span></div>)}<button className="secondary-action full-action" type="button" onClick={()=>void loadProviderStatus()}>Refresh connection status</button><div className="capability-note"><b>LYNE playback</b><p>Imported provider links add metadata and library references. The Windows client also resolves supported provider streams. The mobile PWA still needs that same source-specific resolver; this status is not a statement about your music rights.</p></div></>}
          {settingsSection==="YouTube"&&<><div className="settings-section-title">YouTube</div><div className="capability-note"><b>YouTube account sync is not active in this PWA yet</b><p>Public YouTube links can be resolved when LYNE's backend is configured. Account playback and private library sync require a supported official OAuth flow and provider credentials; LYNE does not use desktop cookies or private endpoints. These controls stay unavailable until that integration is implemented.</p></div></>}
          {settingsSection==="About"&&<><div className="settings-section-title">About LYNE</div><div className="about-card"><div className="brand">LYNE<span>.</span></div><b>LYNE Mobile</b><small>Version 0.1.0 · Build {import.meta.env.VITE_BUILD_SHA?.slice(0,7)||"local"} · Progressive Web App · Checks for updates when opened</small><p>Your music, your space.</p></div><div className="api-setup-panel"><b>First-party LYNE API</b><p>{apiStatus==="online"?"Connected. Catalogue, account and library endpoints are responding.":isApiConfigured()?"A Worker URL is saved, but the health check is failing. Check that the Cloudflare Worker is deployed and its CORS origin includes https://sixseriess.github.io.":"The API has not been connected yet. Deploy the LYNE Worker in Cloudflare first, then paste the workers.dev URL here. This URL is saved on this device."}</p><label className="field-label">Cloudflare Worker URL<input value={apiUrlInput} onChange={e=>setApiUrlInput(e.target.value)} placeholder="https://lyne-api.your-subdomain.workers.dev" inputMode="url" autoComplete="url"/></label><button className="primary-button" onClick={()=>void connectApi()} disabled={apiTesting}>{apiTesting?<LoaderCircle size={15} className="spin"/>:null}{apiTesting?"Testing connection":"Save URL & test connection"}</button><div className="api-setup-status">{apiMessage||"For all devices, also set the GitHub Actions variable VITE_API_URL to this same URL and rebuild the PWA."}</div><button className="provider-open" onClick={()=>window.open("https://github.com/sixseriess/LYNE-MOBILE/blob/main/backend/README.md","_blank","noopener,noreferrer")}>Open API deployment instructions <ExternalLink size={14}/></button></div><div className="setting-line"><span><b>Connection status</b><small>{apiStatus==="online"?"Connected to LYNE":apiMessage||"Not connected"}</small></span><span className={"status-pill "+apiStatus}>{apiStatus==="online"?"online":isApiConfigured()?"offline":"not set"}</span></div><button className="provider-open" onClick={()=>window.open("https://github.com/sixseriess/LYNE-MOBILE","_blank","noopener,noreferrer")}>LYNE Mobile on GitHub <ExternalLink size={14}/></button><button className="provider-open" onClick={()=>window.open("https://discord.gg/WtzrU9ERbN","_blank","noopener,noreferrer")}>Support <ExternalLink size={14}/></button></>}
        </div>
      </div>}
      {modal==="queue"&&<div className="track-list">{queue.length?queue.map((t,index)=><div className="queue-manage-row" key={t.id}><button className="queue-row-main" onClick={()=>play(t,queue)}><Cover track={t}/><span><b>{t.title}</b><small>{t.artist}</small></span>{current?.id===t.id&&<span className="queue-playing">PLAYING</span>}</button><div className="queue-actions"><button className="plain-icon" aria-label={"Move "+t.title+" up"} disabled={index===0} onClick={()=>moveQueueTrack(t.id,-1)}><ChevronUp size={15}/></button><button className="plain-icon" aria-label={"Move "+t.title+" down"} disabled={index===queue.length-1} onClick={()=>moveQueueTrack(t.id,1)}><ChevronDown size={15}/></button><button className="plain-icon" aria-label={"Remove "+t.title+" from queue"} disabled={current?.id===t.id} onClick={()=>removeQueueTrack(t.id)}><X size={15}/></button></div></div>):<Empty title="Queue is empty" text="Play something to start a queue."/ >}</div>}
      {modal==="lyrics"&&<div className="lyrics-body"><div className="lyrics-offset"><label>Lyrics timing <input aria-label="Lyrics timing offset" type="range" min="-5000" max="5000" step="250" value={state.preferences.lyricsOffsetMs} onChange={e=>setState(s=>({...s,preferences:{...s.preferences,lyricsOffsetMs:Number(e.target.value)}}))}/></label><small>{state.preferences.lyricsOffsetMs>0?"+":""}{(state.preferences.lyricsOffsetMs/1000).toFixed(2)}s · positive delays the highlight</small></div>{syncedLyrics.length?syncedLyrics.map((line,index)=><p key={index} className={index===activeLyricIndex?"lyric-line active":"lyric-line"}>{line.text}</p>):<p>{current?.lyrics||"Synced lyrics aren't available for this track yet."}</p>}</div>}
    </div></div>}
    {notice&&<div className="notice" role="status" aria-live="polite"><span>{notice}</span><button type="button" className="plain-icon" aria-label="Dismiss notification" onClick={()=>setNotice("")}><X size={15}/></button></div>}
  </main>;
}
function SettingToggle({title,description,checked,onChange}:{title:string;description:string;checked:boolean;onChange:(value:boolean)=>void}){return <div className="setting-line"><span><b>{title}</b><small>{description}</small></span><button type="button" role="switch" aria-checked={checked} className={checked?"toggle on":"toggle"} onClick={()=>onChange(!checked)} /></div>;}
function Empty({title,text}:{title:string;text:string}){return <div className="empty"><div className="empty-icon"><Music2/></div><b>{title}</b><p>{text}</p></div>;}
function Rankings({items}:{items:[string,number][]}){return items.length?<div className="rank-list">{items.map(([name,ms],i)=><div className="rank-row" key={name}><span className="rank-number">{i+1}</span><span className="rank-name">{name}</span><small>{Math.floor(ms/60000)}m</small></div>)}</div>:<Empty title="Your rankings will appear here" text="Listen to music to start building your top 10."/>;}
