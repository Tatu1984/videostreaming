import { NextResponse } from 'next/server'
import { listCameras, upsertCamera, removeCamera, isWritable } from '@/lib/store'
import type { Camera } from '@/lib/types'

// Admin camera registry management. This is the ONLY write surface. It is guarded
// by an optional bearer token (LIVEFEED_ADMIN_TOKEN): if the env var is set, a
// matching `Authorization: Bearer <token>` is required; if it is unset, the
// endpoint is open (fine for a trusted local/dev portal — set the token for any
// shared deployment).
//
// NOTE: the portal itself has NO viewer authentication by design (the AI dev
// opens it and sees feeds). This token only protects REGISTRY EDITS, not viewing.

function authorized(request: Request): boolean {
  const token = process.env.LIVEFEED_ADMIN_TOKEN
  if (!token) return true // no token configured → open (dev/local)
  const h = request.headers.get('authorization') || ''
  return h.startsWith('Bearer ') && h.slice(7) === token
}

function validCamera(x: unknown): x is Camera {
  if (!x || typeof x !== 'object') return false
  const c = x as Record<string, unknown>
  if (typeof c.id !== 'string' || !c.id.trim()) return false
  if (typeof c.name !== 'string' || !c.name.trim()) return false
  if (typeof c.hlsUrl !== 'string' || !/^https?:\/\//.test(c.hlsUrl)) return false
  if (c.group !== undefined && typeof c.group !== 'string') return false
  if (c.note !== undefined && typeof c.note !== 'string') return false
  return true
}

// GET /api/admin/cameras → full registry (no status probing).
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ cameras: await listCameras(), writable: isWritable() })
}

// POST /api/admin/cameras  body: Camera  → upsert by id.
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  if (!validCamera(body)) {
    return NextResponse.json(
      { error: 'camera requires id, name, and an http(s) hlsUrl' },
      { status: 400 }
    )
  }
  const saved = await upsertCamera({
    id: body.id.trim(),
    name: body.name.trim(),
    hlsUrl: body.hlsUrl,
    group: body.group,
    note: body.note,
  })
  return NextResponse.json({ camera: saved, writable: isWritable() }, { status: 201 })
}

// DELETE /api/admin/cameras?id=cam-001 → remove by id.
export async function DELETE(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  const existed = await removeCamera(id)
  return NextResponse.json({ removed: existed }, { status: existed ? 200 : 404 })
}
