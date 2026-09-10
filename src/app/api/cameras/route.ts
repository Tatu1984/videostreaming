import { NextResponse } from 'next/server'
import { readSession } from '@/lib/auth'
import { createCamera, listCameras } from '@/lib/repo'
import { toViews } from '@/lib/status'

export const dynamic = 'force-dynamic'

// Base URL for building playback/ingest URLs shown to the operator.
function baseUrl(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL
  if (env) return env.replace(/\/+$/, '')
  // Fall back to the request origin.
  try {
    return new URL(request.url).origin
  } catch {
    return ''
  }
}

// GET /api/cameras → the logged-in user's cameras + live status. 401 if not auth.
//
// Wrapped so nothing (a DB error, or a slow/failed R2 liveness check) can hang or
// crash the request without a response — a hung request shows in the browser as a
// status-0 "Loading…" that never resolves. toViews() is already resilient
// per-camera (a bad R2 read → OFFLINE, not a throw), and the R2 client has a hard
// timeout, so the list always comes back promptly.
export async function GET(request: Request) {
  const s = await readSession()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const cams = await listCameras(s.userId)
    const views = await toViews(cams, baseUrl(request))
    return NextResponse.json({ cameras: views })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    console.error('[GET /api/cameras] failed:', msg, err)
    return NextResponse.json({ error: `cameras failed: ${msg}` }, { status: 500 })
  }
}

// POST /api/cameras  { name, group? } → creates a camera OWNED by the user and
// returns the one-time ingest token + the exact ingest URL to paste into the
// Edge Agent. The token is shown ONCE (only its hash is stored).
export async function POST(request: Request) {
  const s = await readSession()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { name?: string; group?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const name = (body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  const group = (body.group || '').trim() || null

  const cam = await createCamera(s.userId, name, group)
  const base = baseUrl(request)
  return NextResponse.json(
    {
      camera: { id: cam.id, name: cam.name, group: cam.group, ingestKey: cam.ingestKey },
      // Everything the operator needs to configure their Edge Agent — shown ONCE.
      edgeAgent: {
        ingestUrl: base, // Portal Connection → Ingest URL
        ingestToken: cam.ingestToken, // Portal Connection → Token (shown once!)
        // The camera's full publish target (agent uses ingestUrl + this key):
        publishUrl: `${base}/api/edge/ingest/${cam.ingestKey}/index.m3u8`,
        cameraId: cam.ingestKey,
      },
    },
    { status: 201 }
  )
}
