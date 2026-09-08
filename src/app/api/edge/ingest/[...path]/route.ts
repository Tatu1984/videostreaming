import { NextResponse } from 'next/server'
import { getMediaStore, safeKey, safeName, contentTypeFor, cacheControlFor } from '@/lib/media/store'

/**
 * Edge HLS ingest + playback — the bridge between the Edge Agent and the browser.
 *
 *   PUT/DELETE /api/edge/ingest/<streamKey>/<file>   ← Edge Agent (Bearer token)
 *   GET        /api/edge/ingest/<streamKey>/<file>   ← browser  (credential-free)
 *
 * The Edge Agent's ffmpeg uploads HLS files via outbound HTTP PUT (NAT-friendly).
 * Bytes are written to the configured media store (Cloudflare R2 at scale, or a
 * local disk for dev). Playback is credential-free (the URL is the capability),
 * matching the portal's security model. Path traversal and non-HLS files are
 * rejected. When R2 has a public/CDN base, GET redirects the browser straight to
 * the CDN so segment bytes never flow through this function — the key to serving
 * many viewers cheaply.
 *
 * INGEST AUTH: set EDGE_INGEST_TOKEN. Uploads must send
 *   Authorization: Bearer <EDGE_INGEST_TOKEN>
 * (matching the token pasted into the Edge Agent's Portal Connection). If the
 * env var is unset, uploads are open — only acceptable for local/dev.
 */

export const dynamic = 'force-dynamic'

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

function ingestAuthorized(req: Request): boolean {
  const token = process.env.EDGE_INGEST_TOKEN
  if (!token) return true // no token configured → open (dev only)
  return bearer(req) === token
}

function parse(parts: string[]): { key: string; file: string } | null {
  if (!parts || parts.length < 2) return null
  const key = safeKey(parts[0])
  const file = safeName(parts.slice(1).join('/'))
  if (!key || !file) return null
  return { key, file }
}

async function handleWrite(req: Request, parts: string[]) {
  if (!ingestAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const p = parse(parts)
  if (!p) return NextResponse.json({ error: 'bad path' }, { status: 400 })

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

// Some ffmpeg builds POST instead of PUT — accept both.
export const POST = PUT

export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!ingestAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { path } = await ctx.params
  const p = parse(path)
  if (!p) return NextResponse.json({ error: 'bad path' }, { status: 400 })
  const store = await getMediaStore()
  await store.delete(p.key, p.file)
  return new NextResponse(null, { status: 204 })
}

// Browser playback — credential-free.
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const p = parse(path)
  if (!p) return NextResponse.json({ error: 'bad path' }, { status: 400 })

  const store = await getMediaStore()
  const res = await store.get(p.key, p.file)
  if (!res.ok) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // R2 with a CDN base: send the browser straight to the CDN (no bytes through us).
  if (res.redirectUrl) {
    return NextResponse.redirect(res.redirectUrl, 302)
  }

  const { type, kind } = contentTypeFor(p.file)
  return new NextResponse(res.body ? new Uint8Array(res.body) : null, {
    status: 200,
    headers: {
      'Content-Type': res.contentType || type,
      'Cache-Control': cacheControlFor(kind),
      'Access-Control-Allow-Origin': '*',
    },
  })
}
