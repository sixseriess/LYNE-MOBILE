CREATE TABLE IF NOT EXISTS imported_likes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  external_url TEXT NOT NULL,
  artwork_url TEXT,
  embed_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, provider, provider_item_id)
);
CREATE INDEX IF NOT EXISTS imported_likes_user_idx ON imported_likes(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS imported_collections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_item_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('playlist','album')),
  title TEXT NOT NULL,
  subtitle TEXT,
  external_url TEXT NOT NULL,
  artwork_url TEXT,
  embed_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, provider, provider_item_id, kind)
);
CREATE INDEX IF NOT EXISTS imported_collections_user_idx ON imported_collections(user_id,created_at DESC);
