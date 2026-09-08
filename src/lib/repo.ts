// Data-access layer over Neon. All camera queries are scoped by user_id, which
// is how per-user isolation is enforced: a user can only ever see or mutate rows
// they own. The ingest lookup (by ingest_key) is the one cross-user query, used
// only to route an upload to the correct owner's camera.

import { randomUUID } from 'crypto'
import { db, ensureSchema, type UserRow, type CameraRow } from './db'
import { hashPassword, newIngestKey, newIngestToken, hashToken } from './auth'

// ── users ───────────────────────────────────────────────────────────────────

export async function createUser(email: string, password: string): Promise<UserRow> {
  await ensureSchema()
  const sql = db()
  const id = randomUUID()
  const rows = (await sql`
    INSERT INTO users (id, email, password_hash)
    VALUES (${id}, ${email.toLowerCase()}, ${hashPassword(password)})
    RETURNING id, email, password_hash, created_at
  `) as UserRow[]
  return rows[0]
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  await ensureSchema()
  const sql = db()
  const rows = (await sql`
    SELECT id, email, password_hash, created_at FROM users WHERE email = ${email.toLowerCase()}
  `) as UserRow[]
  return rows[0] || null
}

// ── cameras (all scoped by owner) ─────────────────────────────────────────────

/** A camera as returned to the owner, INCLUDING the freshly-issued ingest token
 *  (only on creation — the token is never stored in plaintext, so it can't be
 *  shown again later; the owner must copy it now). */
export interface CreatedCamera {
  id: string
  name: string
  group: string | null
  ingestKey: string
  ingestToken: string // shown ONCE
}

export async function createCamera(
  userId: string,
  name: string,
  group: string | null
): Promise<CreatedCamera> {
  await ensureSchema()
  const sql = db()
  const id = randomUUID()
  const ingestKey = newIngestKey()
  const ingestToken = newIngestToken()
  await sql`
    INSERT INTO cameras (id, user_id, name, grp, ingest_key, ingest_token_hash)
    VALUES (${id}, ${userId}, ${name}, ${group}, ${ingestKey}, ${hashToken(ingestToken)})
  `
  return { id, name, group, ingestKey, ingestToken }
}

/** List a user's cameras (no secrets). */
export async function listCameras(userId: string): Promise<CameraRow[]> {
  await ensureSchema()
  const sql = db()
  return (await sql`
    SELECT id, user_id, name, grp, ingest_key, ingest_token_hash, created_at
    FROM cameras WHERE user_id = ${userId} ORDER BY created_at ASC
  `) as CameraRow[]
}

/** Get one camera IF it belongs to the user (else null). */
export async function getUserCamera(userId: string, id: string): Promise<CameraRow | null> {
  await ensureSchema()
  const sql = db()
  const rows = (await sql`
    SELECT id, user_id, name, grp, ingest_key, ingest_token_hash, created_at
    FROM cameras WHERE id = ${id} AND user_id = ${userId}
  `) as CameraRow[]
  return rows[0] || null
}

/** Delete a camera IF it belongs to the user. Returns true if a row was removed. */
export async function deleteCamera(userId: string, id: string): Promise<boolean> {
  await ensureSchema()
  const sql = db()
  const rows = (await sql`
    DELETE FROM cameras WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `) as { id: string }[]
  return rows.length > 0
}

/** Regenerate a camera's ingest token (revokes the old one). Owner-scoped. */
export async function rotateCameraToken(userId: string, id: string): Promise<string | null> {
  await ensureSchema()
  const sql = db()
  const token = newIngestToken()
  const rows = (await sql`
    UPDATE cameras SET ingest_token_hash = ${hashToken(token)}
    WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `) as { id: string }[]
  return rows.length ? token : null
}

/** Look up a camera by its ingest key (for the upload path — cross-user). */
export async function findByIngestKey(ingestKey: string): Promise<CameraRow | null> {
  await ensureSchema()
  const sql = db()
  const rows = (await sql`
    SELECT id, user_id, name, grp, ingest_key, ingest_token_hash, created_at
    FROM cameras WHERE ingest_key = ${ingestKey}
  `) as CameraRow[]
  return rows[0] || null
}
