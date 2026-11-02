import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Home, Search, Library, UserRound, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat2,
  Heart, MoreHorizontal, Headphones, Plus, ChevronRight, Music2, Settings, ListMusic,
  Upload, X, Volume2, Maximize2, Minimize2, Clock3, Disc3, Mic2, LogOut, ImagePlus,
  Download, SlidersHorizontal, Share2, Check, Radio, Music, Sparkles, ArrowLeft, LoaderCircle,
  Link2, ExternalLink, ChevronUp, ChevronDown, Trash2, Pencil, ListPlus
} from "lucide-react";
import { lyneApi, type Track, type Playlist, type SearchKind, type ResolvedImport, type SavedImport } from "./api/client";

type Tab = "Home" | "Search" | "Library" | "Stats" | "Profile";
type Period = "day" | "week" | "month" | "year";
type PlayRecord = { id: string; title: string; artist: string; ms: number; day: string };
const STORE = "lyne.mobile.v1";
type StoredAudio = { id: string; name: string; file: File };
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
async function saveAudioFile(id:string,file:File):Promise<void>{
  const db=await openAudioStore();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(AUDIO_STORE,"readwrite");
    tx.objectStore(AUDIO_STORE).put({id,name:file.name,file} satisfies StoredAudio);
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
const blankState = { likes: [] as string[], playlists: [] as Playlist[], stats: [] as PlayRecord[], history: [] as Track[], importedLikes: [] as SavedImport[], importedCollections: [] as SavedImport[], profile: { name: "Listener", avatar: "" }, theme: "dark", repeat: "off" as "off"|"all"|"one", preferences: { autoplaySimilar: true, trackTapBehavior: "play" as "play"|"queue", defaultPlaybackContext: "resume" as "resume"|"empty", pauseOnInterruption: true, touchGestures: true, haptics: true, miniPlayer: true, discordPresence: false, youtubeAccountPlayback: false, youtubePromptSignIn: true, youtubeSyncLibrary: false, language: "en" as "en"|"system", reduceMotion: false, cacheLimitMb: 500, audioQuality: "auto" as "auto"|"lossless" } };
const providerName = (provider: string) => ({spotify:"Spotify",soundcloud:"SoundCloud",youtube:"YouTube",apple_music:"Apple Music"} as Record<string,string>)[provider] || provider;
const artwork = (track: Track) => track.artwork || "";
function getAudioSourceQuality(track:Track):{label:string;lossless:boolean;format:string}{
  const mime=(track.audioMime||"").toLowerCase().split(";")[0].trim();
  const url=(track.audioUrl||"").toLowerCase();
  if(mime==="audio/flac"||mime==="audio/x-flac"||/\.flac(?:$|[?#])/.test(url))return {label:"FLAC · Lossless",lossless:true,format:"FLAC"};
  if(mime==="audio/wav"||mime==="audio/x-wav"||mime==="audio/wave"||/\.wav(?:$|[?#])/.test(url))return {label:"WAV · Lossless PCM",lossless:true,format:"WAV"};
  if(mime==="audio/alac"||/\.alac(?:$|[?#])/.test(url))return {label:"ALAC · Lossless",lossless:true,format:"ALAC"};
  if(mime==="audio/mpeg"||/\.mp3(?:$|[?#])/.test(url))return {label:"MP3 · Lossy",lossless:false,format:"MP3"};
  if(mime==="audio/aac"||/\.aac(?:$|[?#])/.test(url))return {label:"AAC · Lossy",lossless:false,format:"AAC"};
  if(mime==="audio/opus"||/\.opus(?:$|[?#])/.test(url))return {label:"Opus · Lossy",lossless:false,format:"Opus"};
  if(mime==="audio/mp4"||/\.(m4a|mp4)(?:$|[?#])/.test(url))return {label:"M4A · Codec not verified",lossless:false,format:"M4A"};
  return {label:"Source quality not reported",lossless:false,format:"Unknown"};
}
const fmtTime = (ms: number) => { const s=Math.max(0,Math.floor(ms/1000)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; };
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
async function resizePlaylistImage(file: File): Promise<string> { const bitmap = await createImageBitmap(file); const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); const context = canvas.getContext("2d"); if (!context) { bitmap.close(); throw new Error("Could not process that image."); } context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return canvas.toDataURL("image/jpeg", 0.82); }
async function syncPendingPlaylists(items: Playlist[]): Promise<Playlist[]> {
  return Promise.all(items.map(async playlist=>{
    if(playlist.synced)return playlist;
    try{
      const remote=await lyneApi.createPlaylist(playlist.name,playlist.description||"");
      const synced={...playlist,id:remote.id,synced:true};
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
export default function App() {
  const [tab,setTab]=useState<Tab>("Home");
  const [state,setState]=useState(loadState);
  const [current,setCurrent]=useState<Track|null>(null);
  const [queue,setQueue]=useState<Track[]>([]);
  const [playing,setPlaying]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(0);
  const [volume,setVolume]=useState(0.8);
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<SearchKind>("all");
  const [results,setResults]=useState<Track[]>([]);
  const [artistResults,setArtistResults]=useState<{id:string;name:string;bio?:string}[]>([]);
  const [albumResults,setAlbumResults]=useState<{id:string;title:string;artist:string;artistId:string;artwork?:string}[]>([]);
  const [artistDetail,setArtistDetail]=useState<{artist:{id:string;name:string;bio?:string;artwork?:string};tracks:Track[];albums:{id:string;title:string;releaseDate?:string;artwork?:string}[]}|null>(null);
  const [albumDetail,setAlbumDetail]=useState<{album:{id:string;title:string;artist:string;artistId:string;releaseDate?:string;artwork?:string};tracks:Track[]}|null>(null);
  const [detailBusy,setDetailBusy]=useState(false);
  const [apiStatus,setApiStatus]=useState<"checking"|"online"|"offline">("checking");
  const [apiMessage,setApiMessage]=useState("");
  const [homeTracks,setHomeTracks]=useState<Track[]>([]);
  const [loadingSearch,setLoadingSearch]=useState(false);
  const [modal,setModal]=useState<"playlist"|"playlistDetail"|"track"|"artistDetail"|"albumDetail"|"account"|"settings"|"queue"|"lyrics"|"import"|"collection"|null>(null);
  const [importUrl,setImportUrl]=useState("");
  const [importPreview,setImportPreview]=useState<ResolvedImport|null>(null);
  const [importError,setImportError]=useState("");
  const [importBusy,setImportBusy]=useState(false);
  const [activeCollection,setActiveCollection]=useState<SavedImport|null>(null);
  const [playlistName,setPlaylistName]=useState("");
  const [selectedPlaylistId,setSelectedPlaylistId]=useState<string|null>(null);
  const [editPlaylistName,setEditPlaylistName]=useState("");
  const [activeTrack,setActiveTrack]=useState<Track|null>(null);
  const playlistCoverRef=useRef<HTMLInputElement|null>(null);
  const [accountName,setAccountName]=useState("");
  const [accountEmail,setAccountEmail]=useState("");
  const [accountPassword,setAccountPassword]=useState("");
  const [accountMode,setAccountMode]=useState<"login"|"register">("login");
  const [accountMessage,setAccountMessage]=useState("");
  const [user,setUser]=useState<{id:string;username:string}|null>(null);
  const [guestMode,setGuestMode]=useState(false);
  const [accountBusy,setAccountBusy]=useState(false);
  const [period,setPeriod]=useState<Period>("week");
  const [localTracks,setLocalTracks]=useState<Track[]>([]);
  const [shuffle,setShuffle]=useState(false);
  const [notice,setNotice]=useState("");
  const [settingsSection,setSettingsSection]=useState<"Appearance"|"Playback"|"Storage"|"Shortcuts"|"Overlay"|"Discord"|"YouTube"|"About">("Appearance");
  const [storageUsed,setStorageUsed]=useState<number|null>(null);
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const fileRef=useRef<HTMLInputElement|null>(null);
  const currentRef=useRef<Track|null>(null);
  const listeningReportedRef=useRef<string|null>(null);

  useEffect(()=>{ localStorage.setItem(STORE,JSON.stringify(state)); document.documentElement.dataset.theme=state.theme; },[state]);
  useEffect(()=>{ currentRef.current=current; },[current]);
  useEffect(()=>{
    const token=localStorage.getItem("lyne.accessToken");
    if(!token)return;
    let active=true;
    void Promise.all([lyneApi.me(),lyneApi.playlists(),lyneApi.getImports()]).then(async ([profile,remote,imports])=>{
      if(!active)return;
      const syncedLocal=await syncPendingPlaylists(state.playlists);
      if(!active)return;
      const remotePlaylists=remote.playlists.map(item=>({...item,synced:true}));
      const merged=[...remotePlaylists,...syncedLocal.filter(item=>!remotePlaylists.some(remoteItem=>remoteItem.id===item.id))];
      setUser({id:profile.id,username:profile.username});
      setGuestMode(false);
      setState(old=>({...old,profile:{...old.profile,name:profile.username,avatar:profile.avatar||old.profile.avatar},playlists:merged,importedLikes:imports.likes||[],importedCollections:imports.collections||[]}));
    }).catch(()=>{
      if(!active)return;
      localStorage.removeItem("lyne.accessToken");
      setUser(null);
      setNotice("Your LYNE session expired. Sign in again to sync your account.");
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
        return {id:entry.id,title:entry.name.replace(/\.[^.]+$/,""),artist:"Local file",audioUrl,audioMime:entry.file.type,audioSize:entry.file.size,durationMs:0,source:"local" as const};
      });
      setLocalTracks(restored);
    }).catch(()=>{if(!cancelled)setNotice("Saved device audio could not be restored in this browser.");});
    return ()=>{cancelled=true;urls.forEach(url=>URL.revokeObjectURL(url));};
  },[]);
  useEffect(()=>{ let live=true; lyneApi.health().then(()=>{if(live){setApiStatus("online");setApiMessage("");}}).catch(e=>{if(live){setApiStatus("offline");setApiMessage(e.message);}}); return ()=>{live=false;}; },[]);
  useEffect(()=>{ if(apiStatus!=="online")return; lyneApi.home().then(data=>setHomeTracks([...(data.recentlyPlayed||[]),...(data.popular||[])] )).catch(e=>setApiMessage(e.message)); },[apiStatus]);
  useEffect(()=>{ if(!current?.audioUrl){ if(audioRef.current)audioRef.current.pause(); return; } const audio=audioRef.current; if(!audio)return; audio.src=current.audioUrl; audio.volume=volume; if(playing)void audio.play().catch(()=>{setPlaying(false);setNotice("This track couldn't be played.");}); },[current?.id,current?.audioUrl]);
  useEffect(()=>{ if(audioRef.current){audioRef.current.volume=volume;if(playing)void audioRef.current.play().catch(()=>setPlaying(false));else audioRef.current.pause();} },[playing,volume]);
  useEffect(()=>{ if(!playing||!current)return; const timer=window.setInterval(()=>{ const audio=audioRef.current; if(audio){setPosition(audio.currentTime*1000);setDuration(Number.isFinite(audio.duration)?audio.duration*1000:0);} },500); return ()=>window.clearInterval(timer); },[playing,current?.id]);
  useEffect(()=>{ if(!playing||!current)return; const timer=window.setInterval(()=>{setState(s=>{const key=dayKey();const old=s.stats.find(x=>x.id===current.id&&x.day===key);const item={id:current.id,title:current.title,artist:current.artist,ms:(old?.ms||0)+1000,day:key};return {...s,stats:old?s.stats.map(x=>x===old?item:x):[...s.stats,item]};});},1000);return()=>window.clearInterval(timer); },[playing,current?.id]);
  const reportListening=useCallback((track:Track|null,listenedMs:number)=>{
    if(!user||!track||track.source==="local"||listenedMs<1000||listeningReportedRef.current===track.id)return;
    listeningReportedRef.current=track.id;
    void lyneApi.listening({trackId:track.id,listenedMs:Math.min(3600000,Math.floor(listenedMs)),playedAt:new Date().toISOString()}).catch(()=>{listeningReportedRef.current=null;});
  },[user]);
  const play = useCallback((track:Track,list:Track[] = [])=>{
    if(current&&current.id!==track.id)reportListening(current,position);
    listeningReportedRef.current=null;
    const quality=getAudioSourceQuality(track);
    if(state.preferences.audioQuality==="lossless"&&!quality.lossless){
      setNotice("Lossless only is enabled. "+quality.label+". Choose Auto or use a FLAC, WAV or ALAC source.");
      return;
    }
    setCurrent(track);
    setQueue(list.length?list.filter(t=>t.id!==track.id):[track]);
    setPlaying(true);setExpanded(false);
    setState(old=>({...old,history:[track,...old.history.filter(t=>t.id!==track.id)].slice(0,50)}));
  },[state.preferences.audioQuality,current,position,reportListening]);
  const toggleLike=(track:Track)=>setState(s=>({...s,likes:s.likes.includes(track.id)?s.likes.filter(id=>id!==track.id):[...s.likes,track.id]}));
  const next=()=>{if(!queue.length)return;const idx=queue.findIndex(t=>t.id===current?.id);const target=shuffle?queue[Math.floor(Math.random()*queue.length)]:queue[(idx+1)%queue.length];if(target)play(target,queue);};
  const previous=()=>{if(position>3000){if(audioRef.current)audioRef.current.currentTime=0;setPosition(0);return;}const idx=queue.findIndex(t=>t.id===current?.id);const target=queue[(idx-1+queue.length)%queue.length];if(target)play(target,queue);};
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
  const allTracks=useMemo(()=>{const unique=new Map<string,Track>();[...localTracks,...homeTracks,...results,...state.history].forEach(track=>unique.set(track.id,track));return [...unique.values()];}, [localTracks,homeTracks,results,state.history]);
  const selectedPlaylist=state.playlists.find(p=>p.id===selectedPlaylistId)||null;
  const selectedPlaylistTracks=selectedPlaylist?selectedPlaylist.trackIds.map(id=>allTracks.find(track=>track.id===id)).filter(Boolean) as Track[]:[];
  const likedTracks=useMemo(()=>state.likes.map(id=>allTracks.find(t=>t.id===id)).filter(Boolean) as Track[],[state.likes,allTracks]);
  const search=async(value:string,kind:SearchKind)=>{setQuery(value);setFilter(kind);if(value.trim().length<2){setResults([]);return;}setLoadingSearch(true);try{const data=await lyneApi.search(value,kind);setResults(data.tracks||[]);setArtistResults(data.artists||[]);setAlbumResults(data.albums||[]);}catch{setResults([]);setArtistResults([]);setAlbumResults([]);}finally{setLoadingSearch(false);}};
  const openArtist=async(id:string)=>{
    setDetailBusy(true);setArtistDetail(null);setModal("artistDetail");
    try{const detail=await lyneApi.artist(id);setArtistDetail(detail);}
    catch(e){setModal(null);setNotice(e instanceof Error?e.message:"Couldn't load that artist.");}
    finally{setDetailBusy(false);}
  };
  const openAlbum=async(id:string)=>{
    setDetailBusy(true);setAlbumDetail(null);setModal("albumDetail");
    try{const detail=await lyneApi.album(id);setAlbumDetail(detail);}
    catch(e){setModal(null);setNotice(e instanceof Error?e.message:"Couldn't load that album.");}
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
    if(current?.id===track.id){setPlaying(false);setCurrent(null);setPosition(0);}
    setModal(null);
    setNotice("Removed "+track.title+" from this device.");
  };

  const resolveImportLink=async()=>{if(!importUrl.trim())return;setImportBusy(true);setImportError("");setImportPreview(null);try{const item=await lyneApi.resolveImport(importUrl.trim());setImportPreview(item);}catch(e){setImportError(e instanceof Error?e.message:"LYNE couldn't read that link.");}finally{setImportBusy(false);}};
  const saveImportedLink=async()=>{if(!importPreview)return;let synced=false;if(user){try{await lyneApi.saveImport(importPreview);synced=true;}catch(e){setNotice(e instanceof Error?e.message:"Saved locally; LYNE account sync failed.");}}const saved:SavedImport={...importPreview};setState(s=>importPreview.kind==="track"?({...s,importedLikes:[saved,...s.importedLikes.filter(x=>!(x.provider===saved.provider&&x.providerId===saved.providerId))]}):({...s,importedCollections:[saved,...s.importedCollections.filter(x=>!(x.provider===saved.provider&&x.providerId===saved.providerId&&x.kind===saved.kind))]}));setModal(null);setNotice(synced?"Added and synced with your LYNE account.":user?"Added on this device; account sync isn't available right now.":importPreview.kind==="track"?"Added to Liked Songs on this device. Sign in to sync it.":"Added to your library on this device. Sign in to sync it.");};
  const likeImportedTrack=(collection:SavedImport,track:NonNullable<SavedImport["tracks"]>[number])=>{const saved:SavedImport={provider:collection.provider,kind:"track",providerId:track.providerId,title:track.title,subtitle:track.artist,externalUrl:track.externalUrl,artwork:track.artwork,embedUrl:track.embedUrl,tracks:[track]};setState(s=>({...s,importedLikes:[saved,...s.importedLikes.filter(x=>!(x.provider===saved.provider&&x.providerId===saved.providerId))]}));if(user)void lyneApi.saveImport(saved).catch(()=>setNotice("Added locally. Account sync couldn't be completed."));setNotice(`Added ${track.title} to Liked Songs.`);};
  const likeAllImportedTracks=(collection:SavedImport)=>{const tracks=collection.tracks||[];const additions=tracks.map(track=>({provider:collection.provider,kind:"track" as const,providerId:track.providerId,title:track.title,subtitle:track.artist,externalUrl:track.externalUrl,artwork:track.artwork,embedUrl:track.embedUrl,tracks:[track]}));setState(s=>{const existing=new Set(s.importedLikes.map(x=>x.provider+":"+x.providerId));return {...s,importedLikes:[...additions.filter(x=>!existing.has(x.provider+":"+x.providerId)),...s.importedLikes]};});if(user)void Promise.allSettled(additions.map(item=>lyneApi.saveImport(item)));setModal(null);setNotice(`Added ${tracks.length} tracks from ${collection.title} to Liked Songs.`);};
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
  const addNext=(track:Track)=>{setQueue(old=>{const list=old.filter(t=>t.id!==track.id);const index=list.findIndex(t=>t.id===current?.id);list.splice(index>=0?index+1:list.length,0,track);return list;});setNotice("Added "+track.title+" to play next.");setModal(null);};
  const openPlaylist=(playlist:Playlist)=>{setSelectedPlaylistId(playlist.id);setEditPlaylistName(playlist.name);setModal("playlistDetail");};
  const savePlaylistName=()=>{
    if(!selectedPlaylistId||!editPlaylistName.trim())return;
    const playlist=state.playlists.find(p=>p.id===selectedPlaylistId);if(!playlist)return;
    const updated={...playlist,name:editPlaylistName.trim(),updatedAt:Date.now()};
    setState(s=>({...s,playlists:s.playlists.map(p=>p.id===selectedPlaylistId?updated:p)}));
    void persistPlaylist(updated);setNotice("Playlist name updated.");
  };
  const setPlaylistCover=async(file:File)=>{if(!selectedPlaylistId)return;try{const cover=await resizePlaylistImage(file);setState(s=>({...s,playlists:s.playlists.map(p=>p.id===selectedPlaylistId?{...p,cover,updatedAt:Date.now()}:p)}));setNotice("Playlist artwork updated.");}catch(e){setNotice(e instanceof Error?e.message:"Could not use that image.");}};
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
        const [profile,remote,imports]=await Promise.all([lyneApi.me(),lyneApi.playlists(),lyneApi.getImports()]);
        const syncedLocal=await syncPendingPlaylists(state.playlists);
        const remotePlaylists=remote.playlists.map(item=>({...item,synced:true}));
        const merged=[...remotePlaylists,...syncedLocal.filter(item=>!remotePlaylists.some(remoteItem=>remoteItem.id===item.id))];
        setUser({id:profile.id,username:profile.username});
        setState(old=>({...old,profile:{...old.profile,name:profile.username,avatar:profile.avatar||old.profile.avatar},playlists:merged,importedLikes:imports.likes||[],importedCollections:imports.collections||[]}));
      }catch{setNotice("Signed in. Some account library data could not be loaded yet.");}
      setAccountMessage("You're signed in.");setModal(null);setNotice("Signed in to LYNE.");
    }catch(e){localStorage.removeItem("lyne.accessToken");setAccountMessage(e instanceof Error?e.message:"Couldn't connect to LYNE.");}
    finally{setAccountBusy(false);}
  };
  const logout=()=>{localStorage.removeItem("lyne.accessToken");setUser(null);setGuestMode(false);setNotice("Signed out.");};

  const refreshStorage=async()=>{try{const estimate=await navigator.storage?.estimate();setStorageUsed(estimate?.usage??0);}catch{setStorageUsed(null);}};
  const clearCache=async()=>{try{const names=await caches.keys();await Promise.all(names.map(name=>caches.delete(name)));await refreshStorage();setNotice("Cached app files cleared. Your library and account data were kept.");}catch{setNotice("This browser does not allow cache management here.");}};
  const periodStart=()=>{const d=new Date();if(period==="day")return dayKey(d);if(period==="week"){d.setDate(d.getDate()-6);}if(period==="month"){d.setDate(1);}if(period==="year"){d.setMonth(0,1);}return dayKey(d);};
  const periodStats=state.stats.filter(x=>x.day>=periodStart());
  const totalMinutes=Math.floor(periodStats.reduce((sum,x)=>sum+x.ms,0)/60000);
  const ranking=(key:"title"|"artist")=>{const counts=new Map<string,number>();periodStats.forEach(x=>counts.set(x[key],(counts.get(x[key])||0)+x.ms));return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);};
  const shareStats=async()=>{const content=`LYNE listening stats\n${totalMinutes.toLocaleString()} minutes listened\nTop songs: ${ranking("title").slice(0,3).map(x=>x[0]).join(", ")||"Not enough data yet"}\nTop artists: ${ranking("artist").slice(0,3).map(x=>x[0]).join(", ")||"Not enough data yet"}`;try{if(navigator.share)await navigator.share({title:"My LYNE stats",text:content});else if(navigator.clipboard)await navigator.clipboard.writeText(content);else throw new Error();setNotice("Your stats are ready to share.");}catch{setNotice("Sharing was cancelled or isn't available.");}};
  const tracksForTab=tab==="Library"?likedTracks:homeTracks;
  const hour=new Date().getHours();
  const greeting=hour>=5&&hour<12?"Good morning":hour>=12&&hour<17?"Good afternoon":hour>=17&&hour<22?"Good evening":"Good night";
  const dateLabel=new Intl.DateTimeFormat("en",{weekday:"long",month:"long",day:"numeric"}).format(new Date());
  const [homeFilter,setHomeFilter]=useState<"all"|"mixes"|"charts"|"recent">("all");
  const renderRows=(items:Track[])=>items.length?<div className="track-list">{items.map(t=><Row key={t.id} track={t} active={current?.id===t.id} liked={state.likes.includes(t.id)} onPlay={()=>play(t,items)} onLike={()=>toggleLike(t)} onMore={()=>{setActiveTrack(t);setModal("track");}}/>)}</div>:<Empty title="Nothing here yet" text="Your music will show up here once LYNE's catalogue is connected, or add audio files from your device."/>;
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
      <p className="auth-footnote">Guest mode keeps local music and preferences on this device. Sign in any time to sync account features.</p>
    </section>
    <p className="auth-version">LYNE MOBILE · BUILT AROUND YOUR MUSIC</p>
  </main>;

  return <main className="app-shell">
    <audio ref={audioRef} onEnded={()=>{if(state.repeat==="one"&&audioRef.current){audioRef.current.currentTime=0;void audioRef.current.play();}else next();}} onTimeUpdate={e=>setPosition(e.currentTarget.currentTime*1000)} onLoadedMetadata={e=>setDuration(e.currentTarget.duration*1000)} />
    <header className="topbar"><div className="brand"><span>LYNE</span></div><div className="top-actions"><span className={`api-dot ${apiStatus}`} title={apiStatus==="online"?"LYNE API connected":"LYNE API not connected"}/><button className="avatar" onClick={()=>setTab("Profile")} aria-label="Open profile">{state.profile.avatar?<img src={state.profile.avatar}/>:state.profile.name.slice(0,1).toUpperCase()}</button></div></header>
    <section className="page" key={tab}>
      {tab==="Home"&&<><div className="home-art-backdrop" style={homeTracks[0]?.artwork?{backgroundImage:`url("${homeTracks[0].artwork}")`}:undefined}/>
        <div className="home-heading"><div className="home-avatar">{state.profile.avatar?<img src={state.profile.avatar} alt=""/>:state.profile.name.slice(0,1).toUpperCase()}</div><div className="home-heading-copy"><h1>{greeting}{state.profile.name&&state.profile.name!=="Listener"?<span>, {state.profile.name}</span>:""}</h1><p><i/> {dateLabel}</p></div><button className="home-quick-play" onClick={()=>{const track=state.history[0]||homeTracks[0];if(track)play(track,[...state.history,...homeTracks]);else setTab("Search");}}><Play size={14} fill="currentColor"/> Play</button></div>
        <div className="home-filter-pills">{([{id:"all",label:"All"},{id:"mixes",label:"Mixes"},{id:"charts",label:"Charts"},{id:"recent",label:"Recently played"}] as const).map(item=><button key={item.id} className={homeFilter===item.id?"selected":""} onClick={()=>setHomeFilter(item.id)}>{item.label}</button>)}</div>
        {(homeFilter==="all"||homeFilter==="mixes")&&<><div className="section-heading mix-section-heading"><div className="mix-section-icon"><Sparkles size={17}/></div><div className="mix-section-copy"><h2>Your Mixes</h2><small>BASED ON YOUR LISTENING</small></div><span className="section-note">FOR YOU</span></div><div className="mix-grid">{["Daily Mix","On repeat","Discover"].map((name,i)=><button className="mix-tile" key={name} onClick={()=>{const track=homeTracks[i]||state.history[i];if(track)play(track,homeTracks);else setTab("Search");}}><div className={`mix-art mix-${i}`} style={homeTracks[i]?.artwork?{backgroundImage:`url("${homeTracks[i].artwork}")`}:undefined}>{i===0?<Sparkles/>:i===1?<Repeat2/>:<Radio/>}</div><b>{name}</b><small>{i===0?"A mix built around you":i===1?"Your most played":"Find something new"}</small></button>)}</div></>}
        {(homeFilter==="all"||homeFilter==="recent")&&<><div className="section-heading"><h2>Recently played</h2><button className="subtle-action" onClick={()=>setTab("Library")}>See all</button></div>{renderRows(state.history.slice(0,5))}</>}
        {(homeFilter==="all"||homeFilter==="charts")&&<><div className="section-heading"><h2>Popular right now</h2><span className="section-note">FROM LYNE</span></div>{renderRows(homeTracks.slice(0,8))}</>}
        {apiStatus==="offline"&&<div className="api-note"><span>LYNE API isn't connected</span><small>{apiMessage||"Configure the first-party API to load catalogue content and sync your account."}</small></div>}
      </>}
      {tab==="Search"&&<><div className="hero"><p className="eyebrow">EXPLORE THE CATALOGUE</p><h1>Search</h1><p className="muted">Find tracks, artists, albums and playlists.</p></div><label className="searchbox"><Search/><input value={query} onChange={e=>void search(e.target.value,filter)} placeholder="What do you want to listen to?"/></label><div className="filter-pills">{(["all","tracks","artists","albums","playlists"] as SearchKind[]).map(x=><button key={x} className={filter===x?"selected":""} onClick={()=>void search(query,x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div>{loadingSearch?<div className="loading"><LoaderCircle className="spin"/> Searching LYNE...</div>:<>{(filter==="all"||filter==="artists")&&artistResults.length>0&&<><div className="section-heading"><h2>Artists</h2></div><div className="catalog-grid">{artistResults.map(a=><button className="catalog-card" key={a.id} onClick={()=>void openArtist(a.id)}><div className="artist-avatar"><UserRound/></div><b>{a.name}</b><small>Artist</small></button>)}</div></>}{(filter==="all"||filter==="albums")&&albumResults.length>0&&<><div className="section-heading"><h2>Albums</h2></div><div className="catalog-grid">{albumResults.map(a=><button className="catalog-card" key={a.id} onClick={()=>void openAlbum(a.id)}><div className="cover" style={a.artwork?{backgroundImage:`url("${a.artwork}")`}:undefined}>{!a.artwork&&<Disc3/>}</div><b>{a.title}</b><small>{a.artist}</small></button>)}</div></>}{renderRows(results)}</>}</>}
      {tab==="Library"&&<><div className="hero"><p className="eyebrow">YOUR COLLECTION</p><h1>Your library</h1><p className="muted">Everything you've saved, all in one place.</p></div><div className="library-actions"><button onClick={()=>setModal("playlist")}><Plus/> Create playlist</button><button onClick={()=>fileRef.current?.click()}><Upload/> Import files</button><button onClick={()=>{setImportUrl("");setImportPreview(null);setImportError("");setModal("import");}}><Link2/> Paste link</button><input ref={fileRef} hidden type="file" accept="audio/*" multiple onChange={e=>{void importFiles(e.target.files);e.currentTarget.value="";}}/></div>
        <div className="library-row" onClick={()=>setTab("Stats")}><div className="library-art liked-art"><Heart fill="currentColor"/></div><span><b>Liked Songs</b><small>{likedTracks.length} saved tracks</small></span><ChevronRight/></div>
        <div className="library-row" onClick={()=>{}}><div className="library-art local-art"><Headphones/></div><span><b>Local music</b><small>{localTracks.length} tracks on this device</small></span><ChevronRight/></div>
        <div className="section-heading"><h2>Your playlists</h2><button className="subtle-action" onClick={()=>setModal("playlist")}>New playlist</button></div>
        {state.playlists.length?state.playlists.map(p=><button className="playlist-row" key={p.id} onClick={()=>openPlaylist(p)}><div className="library-art playlist-art" style={p.cover?{backgroundImage:`url("${p.cover}")`,backgroundSize:"cover",backgroundPosition:"center"}:undefined}>{!p.cover&&<ListMusic/>}</div><span><b>{p.name}</b><small>Playlist · {p.trackIds.length} tracks</small></span><ChevronRight/></button>):<Empty title="Make it yours" text="Create a playlist and add tracks as your collection grows."/>}
        <div className="section-heading"><h2>Liked tracks</h2><span className="section-note">{likedTracks.length+state.importedLikes.length} songs</span></div>{renderRows(likedTracks)}
        {state.importedLikes.map(item=><button className="imported-row" key={item.provider+item.providerId} onClick={()=>window.open(item.externalUrl,"_blank","noopener,noreferrer")}><div className="cover" style={item.artwork?{backgroundImage:`url("${item.artwork}")`}:undefined}>{!item.artwork&&<Music2/>}</div><span><b>{item.title}</b><small>{item.subtitle} · {providerName(item.provider)}</small></span><ExternalLink size={16}/></button>)}
        <div className="section-heading"><h2>Imported playlists & albums</h2><span className="section-note">{state.importedCollections.length} saved</span></div>
        {state.importedCollections.map(item=><button className="imported-row" key={item.provider+item.providerId+item.kind} onClick={()=>{setActiveCollection(item);setModal("collection");}}><div className="cover" style={item.artwork?{backgroundImage:`url("${item.artwork}")`}:undefined}>{!item.artwork&&<ListMusic/>}</div><span><b>{item.title}</b><small>{item.kind==="album"?"Album":"Playlist"} · {item.subtitle} · {providerName(item.provider)} · {item.tracks?.length||0} tracks</small></span><ChevronRight size={16}/></button>)}
        <div className="section-heading"><h2>Local files</h2><button className="subtle-action" onClick={()=>fileRef.current?.click()}>Add files</button></div>{renderRows(localTracks)}
      </>}
      {tab==="Stats"&&<><div className="hero"><p className="eyebrow">YOUR LISTENING ACTIVITY</p><h1>Your stats</h1><p className="muted">A closer look at what you've been listening to.</p></div><div className="period-pills">{(["day","week","month","year"] as Period[]).map(p=><button className={period===p?"selected":""} onClick={()=>setPeriod(p)} key={p}>{({day:"Day",week:"Week",month:"Month",year:"Year"} as Record<Period,string>)[p]}</button>)}</div><div className="stat-card"><span>TOTAL MINUTES LISTENED</span><strong>{totalMinutes.toLocaleString()}</strong><small>{period==="day"?"Today":period==="week"?"Last 7 days":period==="month"?"This month":"This year"}</small></div><div className="section-heading"><h2>Top 10 songs</h2><span className="section-note">By listening time</span></div><Rankings items={ranking("title")}/><div className="section-heading"><h2>Top 10 artists</h2><span className="section-note">By listening time</span></div><Rankings items={ranking("artist")}/><button className="share-button" onClick={()=>void shareStats()}><Share2/> Share your stats</button><p className="footnote">Listening time is recorded on this device. Account sync becomes available through the LYNE API.</p></>}
      {tab==="Profile"&&<><div className="profile-hero"><div className="profile-avatar">{state.profile.avatar?<img src={state.profile.avatar}/>:state.profile.name.slice(0,1).toUpperCase()}</div><p className="eyebrow">YOUR LYNE ACCOUNT</p><h1>{state.profile.name}</h1><p className="muted">{user?(`Signed in as @${user.username}`):"Personalize your listening space."}</p></div><button className="profile-option" onClick={()=>setModal("account")}><UserRound/><span><b>{user?"Account details":"Sign in or create account"}</b><small>Sync your LYNE music and settings</small></span><ChevronRight/></button><label className="profile-option upload-avatar"><ImagePlus/><span><b>Change profile picture</b><small>Choose an image from your device</small></span><input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)setState(s=>({...s,profile:{...s.profile,avatar:URL.createObjectURL(f)}}));}}/></label><button className="profile-option" onClick={()=>setModal("settings")}><Settings/><span><b>App settings</b><small>Appearance and playback preferences</small></span><ChevronRight/></button><button className="profile-option" onClick={()=>setTab("Stats")}><Clock3/><span><b>Listening stats</b><small>Your minutes, songs and artists</small></span><ChevronRight/></button><button className="profile-option" onClick={()=>{setNotice("Offline downloads require LYNE's media storage API.");}}><Download/><span><b>Downloads & offline</b><small>Manage music available on this device</small></span><ChevronRight/></button>{user&&<button className="signout" onClick={logout}><LogOut/> Sign out</button>}</>}
    </section>
    {current&&state.preferences.miniPlayer&&<button className="mini-player" onClick={()=>setExpanded(true)}><Cover track={current}/><span className="mini-copy"><b>{current.title}</b><small>{current.artist}</small></span><button className="plain-icon" onClick={e=>{e.stopPropagation();toggleLike(current);}}><Heart size={18} fill={state.likes.includes(current.id)?"currentColor":"none"}/></button><button className="plain-icon play-mini" onClick={e=>{e.stopPropagation();setPlaying(v=>!v);}}>{playing?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}</button></button>}
    <nav className="bottom-nav">{([{id:"Home",icon:Home},{id:"Search",icon:Search},{id:"Library",icon:Library},{id:"Stats",icon:Disc3},{id:"Profile",icon:UserRound}] as const).map(({id,icon:Icon})=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={21}/><span>{id}</span></button>)}</nav>
    {expanded&&current&&<div className="player-overlay"><div className="player-art-backdrop" style={current.artwork?{backgroundImage:`url("${current.artwork}")`}:undefined}/><div className="player-top"><button className="plain-icon" onClick={()=>setExpanded(false)}><Minimize2/></button><span>NOW PLAYING</span><button className="plain-icon" onClick={()=>setModal("queue")}><ListMusic/></button></div><Cover track={current} className="player-cover"/><div className="player-track"><div><h2>{current.title}</h2><p>{current.artist}</p><small className="audio-source-label">{getAudioSourceQuality(current).label}</small></div><button className={state.likes.includes(current.id)?"liked plain-icon":"plain-icon"} onClick={()=>toggleLike(current)}><Heart fill={state.likes.includes(current.id)?"currentColor":"none"}/></button></div><input className="seek" type="range" min="0" max={duration||100} value={Math.min(position,duration||100)} onChange={e=>{const v=Number(e.target.value);setPosition(v);if(audioRef.current)audioRef.current.currentTime=v/1000;}}/><div className="time-row"><span>{fmtTime(position)}</span><span>{fmtTime(duration)}</span></div><div className="transport"><button className={shuffle?"control-on":"plain-icon"} onClick={()=>setShuffle(v=>!v)}><Shuffle/></button><button className="plain-icon large-control" onClick={previous}><SkipBack fill="currentColor"/></button><button className="main-play" onClick={()=>setPlaying(v=>!v)}>{playing?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}</button><button className="plain-icon large-control" onClick={next}><SkipForward fill="currentColor"/></button><button className={state.repeat!=="off"?"control-on":"plain-icon"} onClick={()=>setState(s=>({...s,repeat:s.repeat==="off"?"all":s.repeat==="all"?"one":"off"}))}><Repeat2/></button></div><div className="volume-row"><Volume2 size={17}/><input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/><button className="plain-icon" onClick={()=>setModal("lyrics")}><Mic2/></button></div></div>}
    {modal&&<div className="modal-backdrop" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>{modal==="playlist"?"Create playlist":modal==="playlistDetail"?(selectedPlaylist?.name||"Playlist"):modal==="track"?"Song options":modal==="artistDetail"?(artistDetail?.artist.name||"Artist"):modal==="albumDetail"?(albumDetail?.album.title||"Album"):modal==="account"?"LYNE account":modal==="settings"?"Settings":modal==="queue"?"Play queue":modal==="import"?"Import music":modal==="collection"?(activeCollection?.title||"Collection"):"Lyrics"}</h2><button className="plain-icon" onClick={()=>setModal(null)}><X/></button></div>
      {modal==="artistDetail"&&<>{detailBusy?<div className="loading"><LoaderCircle className="spin"/> Loading artist...</div>:artistDetail&&<><div className="music-detail-hero"><div className="music-detail-art artist-detail-art" style={artistDetail.artist.artwork?{backgroundImage:`url("${artistDetail.artist.artwork}")`}:undefined}>{!artistDetail.artist.artwork&&<UserRound size={30}/>}</div><div><p className="eyebrow">ARTIST</p><h3>{artistDetail.artist.name}</h3><small>{artistDetail.tracks.length} tracks · {artistDetail.albums.length} albums</small></div></div>{artistDetail.artist.bio&&<p className="detail-description">{artistDetail.artist.bio}</p>}<div className="section-heading"><h2>Popular tracks</h2><span className="section-note">TOP SONGS</span></div>{renderRows(artistDetail.tracks)}{artistDetail.albums.length>0&&<><div className="section-heading"><h2>Albums</h2></div><div className="detail-album-grid">{artistDetail.albums.map(album=><button className="detail-album-card" key={album.id} onClick={()=>void openAlbum(album.id)}><div className="cover" style={album.artwork?{backgroundImage:`url("${album.artwork}")`}:undefined}>{!album.artwork&&<Disc3/>}</div><b>{album.title}</b><small>{album.releaseDate||"Album"}</small></button>)}</div></>}</>}</>}
      {modal==="albumDetail"&&<>{detailBusy?<div className="loading"><LoaderCircle className="spin"/> Loading album...</div>:albumDetail&&<><div className="music-detail-hero"><div className="music-detail-art" style={albumDetail.album.artwork?{backgroundImage:`url("${albumDetail.album.artwork}")`}:undefined}>{!albumDetail.album.artwork&&<Disc3 size={30}/>}</div><div><p className="eyebrow">ALBUM</p><h3>{albumDetail.album.title}</h3><small>{albumDetail.album.artist}{albumDetail.album.releaseDate?" · "+albumDetail.album.releaseDate:""}</small></div></div><button className="primary-button" onClick={()=>{if(albumDetail.tracks[0])play(albumDetail.tracks[0],albumDetail.tracks);}}> <Play size={14} fill="currentColor"/> Play album</button><div className="section-heading"><h2>Tracks</h2><span className="section-note">{albumDetail.tracks.length} SONGS</span></div>{renderRows(albumDetail.tracks)}</>}</>}
      {modal==="playlistDetail"&&selectedPlaylist&&<><div className="playlist-detail-hero"><div className="playlist-detail-art" style={selectedPlaylist.cover?{backgroundImage:`url("${selectedPlaylist.cover}")`}:undefined}>{!selectedPlaylist.cover&&<ListMusic size={34}/>}</div><div><p className="eyebrow">YOUR PLAYLIST</p><h3>{selectedPlaylist.name}</h3><small>{selectedPlaylist.trackIds.length} tracks · On this device</small></div></div><label className="field-label">Playlist name<input value={editPlaylistName} onChange={e=>setEditPlaylistName(e.target.value)} maxLength={80}/></label><div className="playlist-manage-actions"><button className="primary-button" onClick={savePlaylistName}><Pencil size={15}/> Save name</button><button className="secondary-action" onClick={()=>playlistCoverRef.current?.click()}><ImagePlus size={15}/> Change artwork</button><button className="secondary-action" onClick={()=>setState(s=>({...s,playlists:s.playlists.map(p=>p.id===selectedPlaylist.id?{...p,cover:undefined,updatedAt:Date.now()}:p)}))}><X size={15}/> Remove artwork</button><input ref={playlistCoverRef} hidden type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(file)void setPlaylistCover(file);e.currentTarget.value="";}}/></div><div className="section-heading"><h2>Playlist tracks</h2><span className="section-note">{selectedPlaylistTracks.length} available here</span></div>{selectedPlaylist.trackIds.length?<div className="playlist-track-list">{selectedPlaylist.trackIds.map((id,index)=>{const track=allTracks.find(t=>t.id===id);if(!track)return <div className="playlist-missing" key={id}><span>Track unavailable on this device</span><button className="plain-icon" onClick={()=>removePlaylistTrack(selectedPlaylist,id)} aria-label="Remove unavailable track"><X size={16}/></button></div>;return <div className="playlist-manage-row" key={id}><button className="playlist-manage-play" onClick={()=>play(track,selectedPlaylistTracks)}><Cover track={track}/><span><b>{track.title}</b><small>{track.artist}</small></span></button><button className="plain-icon" disabled={index===0} onClick={()=>movePlaylistTrack(selectedPlaylist,index,-1)} aria-label="Move track up"><ChevronUp size={17}/></button><button className="plain-icon" disabled={index===selectedPlaylist.trackIds.length-1} onClick={()=>movePlaylistTrack(selectedPlaylist,index,1)} aria-label="Move track down"><ChevronDown size={17}/></button><button className="plain-icon" onClick={()=>removePlaylistTrack(selectedPlaylist,id)} aria-label="Remove track"><X size={17}/></button></div>;})}</div>:<Empty title="This playlist is empty" text="Use the more menu beside any track and choose Add to playlist to build this collection."/>}<button className="danger-action playlist-delete" onClick={()=>deletePlaylist(selectedPlaylist)}><Trash2 size={15}/> Delete playlist</button></>}
      {modal==="track"&&activeTrack&&<>{activeTrack.source==="local"&&<button className="danger-action" onClick={()=>void deleteLocalTrack(activeTrack)}><Trash2 size={15}/> Remove file from this device</button>}<div className="track-action-heading"><Cover track={activeTrack} className="track-action-cover"/><div><b>{activeTrack.title}</b><small>{activeTrack.artist}</small></div></div><button className="primary-button" onClick={()=>{play(activeTrack,[activeTrack,...queue.filter(t=>t.id!==activeTrack.id)]);setModal(null);}}>Play now</button><button className="secondary-action full-action" onClick={()=>addNext(activeTrack)}><ListPlus size={16}/> Play next</button><div className="section-heading"><h2>Add to playlist</h2></div>{state.playlists.length?state.playlists.map(playlist=><button className="playlist-pick-row" key={playlist.id} onClick={()=>addToPlaylist(playlist,activeTrack)}><div className="library-art playlist-art" style={playlist.cover?{backgroundImage:`url("${playlist.cover}")`,backgroundSize:"cover",backgroundPosition:"center"}:undefined}>{!playlist.cover&&<ListMusic/>}</div><span><b>{playlist.name}</b><small>{playlist.trackIds.length} tracks</small></span><Plus size={16}/></button>):<Empty title="No playlists yet" text="Create a playlist in your Library, then add songs here."/>}</>}
      {modal==="collection"&&activeCollection&&<><div className="import-preview-main"><div className="cover" style={activeCollection.artwork?{backgroundImage:`url("${activeCollection.artwork}")`}:undefined}><ListMusic/></div><div><b>{activeCollection.title}</b><small>{activeCollection.subtitle}</small><small>{providerName(activeCollection.provider)} · {activeCollection.kind}</small></div></div><div className="collection-actions"><button className="primary-button" onClick={()=>likeAllImportedTracks(activeCollection)}>Add all {activeCollection.tracks?.length||0} tracks to Liked Songs</button><button className="provider-open" onClick={()=>window.open(activeCollection.externalUrl,"_blank","noopener,noreferrer")}>Open original {providerName(activeCollection.provider)} { /* icon is intentionally minimal */ }</button></div><div className="track-list imported-track-list">{(activeCollection.tracks||[]).map(track=><div className="external-track" key={track.providerId}><button className="external-track-main" onClick={()=>window.open(track.externalUrl,"_blank","noopener,noreferrer")}><div className="cover" style={track.artwork?{backgroundImage:`url("${track.artwork}")`}:undefined}>{!track.artwork&&<Music2/>}</div><span><b>{track.title}</b><small>{track.artist}</small></span><ExternalLink size={14}/></button><button className="plain-icon" aria-label="Add to liked songs" onClick={()=>likeImportedTrack(activeCollection,track)}><Heart size={17}/></button></div>)}</div>{!activeCollection.tracks?.length&&<Empty title="No track list returned" text="This source didn't expose its playlist or album tracks to LYNE. You can still open the original link."/>}</>}
      {modal==="import"&&<><p className="import-help">Paste a song, playlist or album link. LYNE will look it up using the provider's official API.</p><label className="field-label">Music link<input autoFocus value={importUrl} onChange={e=>{setImportUrl(e.target.value);setImportPreview(null);setImportError("");}} placeholder="Paste Spotify, SoundCloud, YouTube or Apple Music link" inputMode="url"/></label><button className="primary-button" onClick={()=>void resolveImportLink()} disabled={!importUrl.trim()||importBusy}>{importBusy?"Looking up link...":"Preview link"}</button>{importError&&<p className="import-error">{importError}</p>}{importPreview&&<div className="import-preview"><div className="import-preview-main"><div className="cover" style={importPreview.artwork?{backgroundImage:`url("${importPreview.artwork}")`}:undefined}>{!importPreview.artwork&&<Music2/>}</div><div><b>{importPreview.title}</b><small>{importPreview.subtitle}</small><small>{providerName(importPreview.provider)} · {importPreview.kind}</small></div></div><p>{importPreview.kind==="track"?"This song will be added to Liked Songs.":`This ${importPreview.kind} will be added to your Library.`} {importPreview.tracks.length? `${importPreview.tracks.length} track references found.`:""}</p><button className="primary-button" onClick={()=>void saveImportedLink()}>{importPreview.kind==="track"?"Add to Liked Songs":"Add to Library"}</button><button className="provider-open" onClick={()=>window.open(importPreview.externalUrl,"_blank","noopener,noreferrer")}>Open in {providerName(importPreview.provider)} <ExternalLink size={14}/></button></div>}<p className="modal-note">Supported: Spotify, SoundCloud, YouTube and Apple Music. Provider credentials must be configured on LYNE's backend. Imported items keep their original source link; tracks play through the provider's approved player or stream path.</p></>}
      {modal==="playlist"&&<><label className="field-label">Playlist name<input autoFocus value={playlistName} onChange={e=>setPlaylistName(e.target.value)} placeholder="My playlist"/></label><button className="primary-button" onClick={createPlaylist} disabled={!playlistName.trim()}>Create playlist</button></>}
      {modal==="account"&&<><div className="filter-pills"><button className={accountMode==="login"?"selected":""} onClick={()=>setAccountMode("login")}>Sign in</button><button className={accountMode==="register"?"selected":""} onClick={()=>setAccountMode("register")}>Create account</button></div><label className="field-label">Username<input value={accountName} onChange={e=>setAccountName(e.target.value)} autoComplete="username"/></label>{accountMode==="register"&&<label className="field-label">Email<input value={accountEmail} onChange={e=>setAccountEmail(e.target.value)} type="email" autoComplete="email"/></label>}<label className="field-label">Password<input value={accountPassword} onChange={e=>setAccountPassword(e.target.value)} type="password" autoComplete={accountMode==="login"?"current-password":"new-password"}/></label><button className="primary-button" onClick={()=>void submitAccount()}>{accountMode==="login"?"Sign in":"Create account"}</button>{accountMessage&&<p className="modal-note">{accountMessage}</p>}</>}
      {modal==="settings"&&<div className="settings-layout">
        <div className="settings-tabs">{(["Appearance","Playback","Storage","Shortcuts","Overlay","Discord","YouTube","About"] as const).map(item=><button key={item} className={settingsSection===item?"active":""} onClick={()=>setSettingsSection(item)}>{item}</button>)}</div>
        <div className="settings-content">
          {settingsSection==="Appearance"&&<><div className="settings-section-title">Appearance</div><div className="setting-line"><span><b>Theme</b><small>Choose how LYNE looks on this device</small></span><select value={state.theme} onChange={e=>setState(s=>({...s,theme:e.target.value}))}><option value="dark">Dark</option><option value="light">Light</option></select></div><div className="setting-line"><span><b>Language</b><small>App language</small></span><select value={state.preferences.language} onChange={e=>setState(s=>({...s,preferences:{...s.preferences,language:e.target.value as "en"|"system"}}))}><option value="en">English</option><option value="system">System default</option></select></div><SettingToggle title="Reduce motion" description="Prefer simpler transitions and animations" checked={state.preferences.reduceMotion} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,reduceMotion:v}}))}/></>}
          {settingsSection==="Playback"&&<><div className="settings-section-title">Playback</div><div className="setting-line"><span><b>Audio quality</b><small>Use the original audio source. Lossless only plays verified FLAC, WAV or ALAC files.</small></span><select value={state.preferences.audioQuality} onChange={e=>setState(old=>({...old,preferences:{...old.preferences,audioQuality:e.target.value as "auto"|"lossless"}}))}><option value="auto">Auto · Original source</option><option value="lossless">Lossless only</option></select></div><SettingToggle title="Autoplay similar music" description="Continue with similar tracks when your queue ends" checked={state.preferences.autoplaySimilar} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,autoplaySimilar:v}}))}/><div className="setting-line"><span><b>Tap a track</b><small>Choose what happens when selecting a track</small></span><select value={state.preferences.trackTapBehavior} onChange={e=>setState(s=>({...s,preferences:{...s.preferences,trackTapBehavior:e.target.value as "play"|"queue"}}))}><option value="play">Play now</option><option value="queue">Add to queue</option></select></div><div className="setting-line"><span><b>When opening LYNE</b><small>Choose how playback starts</small></span><select value={state.preferences.defaultPlaybackContext} onChange={e=>setState(s=>({...s,preferences:{...s.preferences,defaultPlaybackContext:e.target.value as "resume"|"empty"}}))}><option value="resume">Resume last queue</option><option value="empty">Start with an empty queue</option></select></div><SettingToggle title="Pause on interruptions" description="Pause when audio focus is interrupted where supported" checked={state.preferences.pauseOnInterruption} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,pauseOnInterruption:v}}))}/><div className="setting-line"><span><b>Repeat</b><small>Playback repeat mode</small></span><select value={state.repeat} onChange={e=>setState(s=>({...s,repeat:e.target.value as typeof s.repeat}))}><option value="off">Off</option><option value="all">Repeat all</option><option value="one">Repeat one</option></select></div><SettingToggle title="Shuffle" description="Randomize the play queue" checked={shuffle} onChange={setShuffle}/></>}
          {settingsSection==="Storage"&&<><div className="settings-section-title">Storage</div><div className="storage-card"><b>{storageUsed===null?"Storage usage unavailable":(storageUsed/1024/1024).toFixed(1)+" MB used"}</b><small>Browser storage estimate for LYNE on this device. Your music provider downloads are managed separately.</small><button className="provider-open" onClick={()=>void refreshStorage()}>Refresh usage</button></div><div className="setting-line"><span><b>Cache limit</b><small>Preferred maximum app cache size</small></span><select value={state.preferences.cacheLimitMb} onChange={e=>setState(s=>({...s,preferences:{...s.preferences,cacheLimitMb:Number(e.target.value)}}))}><option value={100}>100 MB</option><option value={250}>250 MB</option><option value={500}>500 MB</option><option value={1000}>1 GB</option></select></div><button className="danger-action" onClick={()=>void clearCache()}>Clear cached app files</button><p className="settings-note">Clearing cache does not delete your playlists, liked songs, profile, or listening stats.</p></>}
          {settingsSection==="Shortcuts"&&<><div className="settings-section-title">Mobile controls</div><SettingToggle title="Touch gestures" description="Enable swipe gestures in the player where supported" checked={state.preferences.touchGestures} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,touchGestures:v}}))}/><SettingToggle title="Haptic feedback" description="Use vibration feedback for supported touch actions" checked={state.preferences.haptics} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,haptics:v}}))}/><div className="capability-note"><b>Keyboard shortcuts</b><p>Desktop-wide keyboard shortcuts are replaced on mobile by touch controls, supported headset buttons, and the device media controls. Browser and operating-system support varies.</p></div></>}
          {settingsSection==="Overlay"&&<><div className="settings-section-title">Player overlay</div><SettingToggle title="Show mini-player" description="Keep playback controls visible above the bottom navigation" checked={state.preferences.miniPlayer} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,miniPlayer:v}}))}/><div className="capability-note"><b>Picture-in-picture and lock-screen controls</b><p>These depend on browser and operating-system media-session support. LYNE will use the native controls available to the installed PWA; it cannot draw a desktop-style floating overlay above other apps.</p></div></>}
          {settingsSection==="Discord"&&<><div className="settings-section-title">Discord</div><div className="capability-note"><b>Discord Rich Presence isn't available in mobile browsers</b><p>The Windows desktop integration uses native desktop capabilities that an installed PWA cannot access. These settings will become active only if Discord provides a supported mobile integration.</p></div><SettingToggle title="Enable playback status preference" description="Remember your preference for a future supported integration" checked={state.preferences.discordPresence} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,discordPresence:v}}))}/></>}
          {settingsSection==="YouTube"&&<><div className="settings-section-title">YouTube</div><div className="capability-note"><b>Official account connection</b><p>LYNE Mobile uses the first-party LYNE backend. Provider sign-in and playback must use supported official authorization and embed flows; no desktop cookies or private endpoints are used.</p></div><SettingToggle title="Play through your account" description="Use an officially connected YouTube account when supported by LYNE" checked={state.preferences.youtubeAccountPlayback} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,youtubeAccountPlayback:v}}))}/><SettingToggle title="Ask me to sign in" description="Show a sign-in prompt when YouTube requires account access" checked={state.preferences.youtubePromptSignIn} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,youtubePromptSignIn:v}}))}/><SettingToggle title="Sync YouTube library" description="Show supported YouTube playlists in your LYNE library" checked={state.preferences.youtubeSyncLibrary} onChange={v=>setState(s=>({...s,preferences:{...s.preferences,youtubeSyncLibrary:v}}))}/></>}
          {settingsSection==="About"&&<><div className="settings-section-title">About LYNE</div><div className="about-card"><div className="brand">LYNE<span>.</span></div><b>LYNE Mobile</b><small>Version 0.1.0 · Progressive Web App</small><p>Your music, your space.</p></div><div className="setting-line"><span><b>First-party API</b><small>{apiStatus==="online"?"Connected to LYNE":"Not connected"}{apiMessage?" · "+apiMessage:""}</small></span><span className={"status-pill "+apiStatus}>{apiStatus}</span></div><button className="provider-open" onClick={()=>window.open("https://github.com/sixseriess/LYNE-MOBILE","_blank","noopener,noreferrer")}>LYNE Mobile on GitHub <ExternalLink size={14}/></button><button className="provider-open" onClick={()=>window.open("https://discord.com","_blank","noopener,noreferrer")}>Support <ExternalLink size={14}/></button></>}
        </div>
      </div>}
      {modal==="queue"&&<div className="track-list">{queue.length?queue.map(t=><button className="queue-row" key={t.id} onClick={()=>play(t,queue)}><Cover track={t}/><span><b>{t.title}</b><small>{t.artist}</small></span>{current?.id===t.id&&<span className="queue-playing">PLAYING</span>}</button>):<Empty title="Queue is empty" text="Play something to start a queue."/ >}</div>}
      {modal==="lyrics"&&<div className="lyrics-body">{current?.lyrics||"Lyrics aren't available for this track yet."}</div>}
    </div></div>}
    {notice&&<button className="notice" onClick={()=>setNotice("")}>{notice}<X size={15}/></button>}
  </main>;
}
function SettingToggle({title,description,checked,onChange}:{title:string;description:string;checked:boolean;onChange:(value:boolean)=>void}){return <div className="setting-line"><span><b>{title}</b><small>{description}</small></span><button type="button" role="switch" aria-checked={checked} className={checked?"toggle on":"toggle"} onClick={()=>onChange(!checked)} /></div>;}
function Empty({title,text}:{title:string;text:string}){return <div className="empty"><div className="empty-icon"><Music2/></div><b>{title}</b><p>{text}</p></div>;}
function Rankings({items}:{items:[string,number][]}){return items.length?<div className="rank-list">{items.map(([name,ms],i)=><div className="rank-row" key={name}><span className="rank-number">{i+1}</span><span className="rank-name">{name}</span><small>{Math.floor(ms/60000)}m</small></div>)}</div>:<Empty title="Your rankings will appear here" text="Listen to music to start building your top 10."/>;}
