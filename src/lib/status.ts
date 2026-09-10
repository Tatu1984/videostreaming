// Server-side liveness for a camera's HLS feed. Reads the current playlist from
// the media store (R2 or fs) and classifies it. The browser never probes; it
// only plays the owner-scoped playback URL.

import type { CameraRow } from './db'
import type { CameraStatus, CameraView } from './types'
import { getMediaStore } from './media/store'

/** Build the credential-free playback URL for a camera's playlist. */
export function playbackUrl(ingestKey: string, base = ''): string {
  return `${base}/api/edge/ingest/${ingestKey}/index.m3u8`
}

function classify(body: string | null): { status: CameraStatus; available: boolean } {
  if (!body) return { status: 'OFFLINE', available: false }
  const hasSegments = body.includes('#EXTINF') || /\.ts(\?|\s|$)/m.test(body)
  const ended = body.includes('#EXT-X-ENDLIST')
  if (hasSegments && !ended) return { status: 'ONLINE', available: true }
  if (hasSegments && ended) return { status: 'STOPPED', available: false }
  return { status: 'CONNECTING', available: false }
}

async function readPlaylist(ingestKey: string): Promise<string | null> {
  // Fully guarded: any failure (store init, R2 error/timeout, fetch error) →
  // null → the camera reports OFFLINE. It must NEVER throw/hang, or it would
  // break the whole /api/cameras list for every camera.
  try {
    const store = await getMediaStore()
    const res = await store.get(ingestKey, 'index.m3u8')
    if (!res.ok) return null
    if (res.body) return new TextDecoder().decode(res.body)
    // R2 + public base: fetch the playlist text (tiny) to judge liveness.
    if (res.redirectUrl) {
      const r = await fetch(res.redirectUrl, { cache: 'no-store' })
      if (!r.ok) return null
      return await r.text()
    }
    return null
  } catch {
    return null
  }
}

/** Turn a DB camera row into the owner-facing view with live status. */
export async function toView(cam: CameraRow, base = ''): Promise<CameraView> {
  const body = await readPlaylist(cam.ingest_key)
  const { status, available } = classify(body)
  return {
    id: cam.id,
    name: cam.name,
    group: cam.grp,
    ingestKey: cam.ingest_key,
    hlsUrl: playbackUrl(cam.ingest_key, base),
    status,
    available,
    checkedAt: new Date().toISOString(),
  }
}

/** Evaluate many cameras concurrently (bounded). */
export async function toViews(cams: CameraRow[], base = '', concurrency = 12): Promise<CameraView[]> {
  const out: CameraView[] = new Array(cams.length)
  let i = 0
  async function worker() {
    while (i < cams.length) {
      const idx = i++
      out[idx] = await toView(cams[idx], base)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cams.length) }, worker))
  return out
}
