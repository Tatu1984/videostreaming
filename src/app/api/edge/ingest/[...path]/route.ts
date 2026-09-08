import { NextResponse } from 'next/server'
import { getMediaStore, safeKey, safeName, contentTypeFor, cacheControlFor } from '@/lib/media/store'
import { findByIngestKey } from '@/lib/repo'
import { verifyToken } from '@/lib/auth'
import { readSession } from '@/lib/auth'

/**
 * Edge HLS ingest + playback — multi-tenant.
 *
 *   PUT/DELETE /api/edge/ingest/<ingestKey>/<file>   ← Edge Agent
 *       Authorization: Bearer <that camera's ingest token>
 *   GET        /api/edge/ingest/<ingestKey>/<file>   ← browser (OWNER only)
 *
 * Upload: the ingestKey identifies WHICH user's camera this is; the Bearer token
 * must match that camera's stored token hash. So each camera authenticates
 * itself, and video lands in the media store (R2/fs) under its own key.
 *
 * Playback: gated to the camera's OWNER. The viewer must be logged in AND own the
 * camera that owns this ingestKey — so user A can never watch user B's feed even
 * with the URL.
 */

export const dynamic = 'force-dynamic'

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

function parse(parts: string[]): { key: string; file: string } | null {
  if (!parts || parts.length < 2) return null
  const key = safeKey(parts[0])
  const file = safeName(parts.slice(1).join('/'))
  if (!key || !file) return null
  return { key, file }
}

async function handleWrite(req: Request, parts: string[]) {
  const p = parse(parts)
  if (!p) return NextResponse.json({ error: 'bad path' }, { status: 400 })

  const cam = await findByIngestKey(p.key)
  const tok = bearer(req)
  if (!cam || !tok || !verifyToken(tok, cam.ingest_token_hash)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const store = await getMediaStore()
  const body = new Uint8Array(await req.arrayBuffer())
  const res = await store.put(p.key, p.file, body)
  if (!res.ok) return NextResponse.json({ error: res.error || 'write failed' }, { status: 500 })
  return new NextResponse(null, { status: 201 })
}

export async function PUT(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return handleWrite(req, path)
}
export const POST = PUT

export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const p = parse(path)
  if (!p) return NextResponse.json({ error: 'bad path' }, { status: 400 })
  const cam = await findByIngestKey(p.key)
  const tok = bearer(req)
  if (!cam || !tok || !verifyToken(tok, cam.ingest_token_hash)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const store = await getMediaStore()
  await store.delete(p.key, p.file)
  return new NextResponse(null, { status: 204 })
}

// Playback — OWNER only.
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const p = parse(path)
  if (!p) return NextResponse.json({ error: 'bad path' }, { status: 400 })

  // Must be logged in AND own the camera behind this ingest key.
  const session = await readSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const cam = await findByIngestKey(p.key)
  if (!cam || cam.user_id !== session.userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const store = await getMediaStore()
  const res = await store.get(p.key, p.file)
  if (!res.ok) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // NOTE: even with an R2 public base, we stream through here so playback stays
  // owner-gated (a public CDN URL would bypass the ownership check). For a
  // per-user-private feed this is the correct trade-off.
  if (res.redirectUrl && !res.body) {
    const r = await fetch(res.redirectUrl, { cache: 'no-store' })
    if (!r.ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const buf = new Uint8Array(await r.arrayBuffer())
    const { type, kind } = contentTypeFor(p.file)
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': type, 'Cache-Control': cacheControlFor(kind) },
    })
  }

  const { type, kind } = contentTypeFor(p.file)
  return new NextResponse(res.body ? new Uint8Array(res.body) : null, {
    status: 200,
    headers: {
      'Content-Type': res.contentType || type,
      'Cache-Control': cacheControlFor(kind),
    },
  })
}
