PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_norm TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL UNIQUE,
  bio TEXT,
  image_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  release_date TEXT,
  artwork_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS albums_artist_idx ON albums(artist_id);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id TEXT NOT NULL REFERENCES artists(id),
  album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  genre TEXT,
  explicit INTEGER NOT NULL DEFAULT 0,
  audio_key TEXT NOT NULL UNIQUE,
  audio_mime TEXT NOT NULL,
  audio_size INTEGER NOT NULL DEFAULT 0,
  artwork_key TEXT,
  rights_status TEXT NOT NULL CHECK (rights_status IN ('owned','licensed','public_domain')),
  rights_reference TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  plays_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS tracks_artist_idx ON tracks(artist_id);
CREATE INDEX IF NOT EXISTS tracks_album_idx ON tracks(album_id);
CREATE INDEX IF NOT EXISTS tracks_published_idx ON tracks(published, created_at DESC);
CREATE INDEX IF NOT EXISTS tracks_title_idx ON tracks(title);

CREATE TABLE IF NOT EXISTS track_artists (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'featured',
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (track_id, artist_id)
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS playlists_user_idx ON playlists(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS listening_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  listened_ms INTEGER NOT NULL CHECK (listened_ms > 0),
  played_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS listening_user_date_idx ON listening_events(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS listening_track_idx ON listening_events(track_id);
