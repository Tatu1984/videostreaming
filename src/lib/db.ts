// Neon Postgres access layer. The portal's single source of truth for users and
// cameras — the old filesystem store is gone.
//
// Uses @neondatabase/serverless (HTTP driver) which is ideal on Vercel: no
// persistent TCP pool, safe in serverless functions. Requires DATABASE_URL
// (Neon connection string). The schema is created on first use (idempotent), so
// there is no separate migration step for this small app.

import { neon } from '@neondatabase/serverless'

export interface UserRow {
  id: string
  email: string
  password_hash: string
  created_at: string
}

export interface CameraRow {
  id: string
  user_id: string
  name: string
  grp: string | null
  ingest_key: string // unique per camera; used in the ingest URL path
  ingest_token_hash: string // hash of the token the Edge Agent sends
  created_at: string
}

let _sql: ReturnType<typeof neon> | null = null
let _schemaReady: Promise<void> | null = null

function conn() {
  if (_sql) return _sql
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set (Neon connection string required)')
  _sql = neon(url)
  return _sql
}

/** Create tables + indexes if absent. Idempotent; awaited by every query path. */
export async function ensureSchema(): Promise<void> {
  if (_schemaReady) return _schemaReady
  const run = (async () => {
    const sql = conn()
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    await sql`
      CREATE TABLE IF NOT EXISTS cameras (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name              TEXT NOT NULL,
        grp               TEXT,
        ingest_key        TEXT UNIQUE NOT NULL,
        ingest_token_hash TEXT NOT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    await sql`CREATE INDEX IF NOT EXISTS cameras_user_idx ON cameras(user_id)`
    await sql`CREATE INDEX IF NOT EXISTS cameras_key_idx ON cameras(ingest_key)`
  })()
  // Cache the in-flight promise so concurrent requests share one schema setup,
  // but if it REJECTS, clear the cache so a later request can retry (otherwise a
  // one-time connection blip would poison every future request).
  _schemaReady = run
  run.catch(() => {
    if (_schemaReady === run) _schemaReady = null
  })
  return run
}

/** Tagged-template SQL client (call after ensureSchema in query helpers). */
export function db() {
  return conn()
}
