// Self-contained camera registry. File-backed JSON behind a small interface so
// it can later be swapped for SQLite/Postgres without touching callers.
//
// The portal owns this store entirely — it has NO dependency on the Smart-Parking
// app or its database. Cameras are added via the admin API (/api/admin/cameras)
// or by editing the seed file. On a read-only/serverless filesystem (e.g. Vercel)
// writes fall back to an in-memory copy for the process lifetime, and the store
// can also be seeded from the CAMERAS_JSON env var — see load().

import { promises as fs } from 'fs'
import path from 'path'
import type { Camera } from './types'

// Where the registry lives on a writable filesystem.
const DATA_DIR = process.env.LIVEFEED_DATA_DIR || path.join(process.cwd(), 'data')
const DATA_FILE = path.join(DATA_DIR, 'cameras.json')

// In-memory cache. Seeded on first access; the source of truth in environments
// where the filesystem is not writable.
let cache: Camera[] | null = null
let cacheWritable = true

function fromEnv(): Camera[] | null {
  const raw = process.env.CAMERAS_JSON
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as Camera[]
  } catch {
    /* ignore malformed env; fall through to file/seed */
  }
  return null
}

async function readFile(): Promise<Camera[] | null> {
  try {
    const buf = await fs.readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(buf)
    return Array.isArray(parsed) ? (parsed as Camera[]) : []
  } catch {
    return null // missing/unreadable → caller seeds
  }
}

async function writeFile(cams: Camera[]): Promise<void> {
  // Atomic-ish write: temp file then rename, so a concurrent read never sees a
  // half-written file. If the FS is read-only (serverless), remember that and
  // keep serving from cache.
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const tmp = DATA_FILE + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(cams, null, 2), 'utf8')
    await fs.rename(tmp, DATA_FILE)
    cacheWritable = true
  } catch {
    cacheWritable = false // read-only FS → in-memory only for this process
  }
}

/** Load the registry (env → file → seed), caching the result. */
export async function load(): Promise<Camera[]> {
  if (cache) return cache
  const env = fromEnv()
  if (env) {
    cache = env
    return cache
  }
  const file = await readFile()
  if (file) {
    cache = file
    return cache
  }
  // Seed with the bundled default and try to persist it.
  const seed = (await import('./seed')).seedCameras
  cache = [...seed]
  await writeFile(cache)
  return cache
}

/** List all cameras. */
export async function listCameras(): Promise<Camera[]> {
  return [...(await load())]
}

/** Get one camera by id. */
export async function getCamera(id: string): Promise<Camera | undefined> {
  return (await load()).find((c) => c.id === id)
}

/**
 * Add or replace a camera (upsert by id). Returns the saved camera.
 * Persists to disk when possible; otherwise updates the in-memory cache.
 */
export async function upsertCamera(cam: Camera): Promise<Camera> {
  const cams = await load()
  const idx = cams.findIndex((c) => c.id === cam.id)
  if (idx >= 0) cams[idx] = cam
  else cams.push(cam)
  cache = cams
  await writeFile(cams)
  return cam
}

/** Remove a camera by id. Returns true if it existed. */
export async function removeCamera(id: string): Promise<boolean> {
  const cams = await load()
  const next = cams.filter((c) => c.id !== id)
  const changed = next.length !== cams.length
  cache = next
  if (changed) await writeFile(next)
  return changed
}

/** Whether the last write reached disk (false on read-only/serverless FS). */
export function isWritable(): boolean {
  return cacheWritable
}
