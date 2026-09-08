// Server-side liveness check for a camera's HLS feed. The portal asks the ingest
// whether the playlist exists and is being refreshed, so the browser never has
// to probe (and never learns anything but the playback URL).
//
// "Available" = the playlist responds 200 AND looks like a live, sliding-window
// HLS playlist (has segments, no explicit end tag). This is a best-effort signal;
// a portal integrated with the Edge Agent's /streams endpoint can use the agent's
// authoritative status instead.

import type { Camera, CameraStatus, CameraWithStatus } from './types'

const CHECK_TIMEOUT_MS = Number(process.env.LIVEFEED_CHECK_TIMEOUT_MS || 3000)

async function fetchPlaylist(url: string): Promise<{ ok: boolean; body: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      // Never cache liveness checks — we want the current playlist each time.
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!res.ok) return { ok: false, body: '' }
    const body = await res.text()
    return { ok: true, body }
  } catch {
    return { ok: false, body: '' }
  } finally {
    clearTimeout(t)
  }
}

/** Classify a fetched playlist into a status + availability. */
function classify(ok: boolean, body: string): { status: CameraStatus; available: boolean } {
  if (!ok) return { status: 'OFFLINE', available: false }
  const hasSegments = /\.ts(\?|\s|$)/m.test(body) || body.includes('#EXTINF')
  const ended = body.includes('#EXT-X-ENDLIST')
  if (hasSegments && !ended) return { status: 'ONLINE', available: true }
  if (hasSegments && ended) return { status: 'STOPPED', available: false } // VOD/ended
  return { status: 'CONNECTING', available: false } // playlist exists but no media yet
}

/** Evaluate one camera's live status. */
export async function checkCamera(cam: Camera): Promise<CameraWithStatus> {
  const { ok, body } = await fetchPlaylist(cam.hlsUrl)
  const { status, available } = classify(ok, body)
  return { ...cam, status, available, checkedAt: new Date().toISOString() }
}

/** Evaluate many cameras concurrently (bounded) — used by the list endpoint. */
export async function checkAll(cams: Camera[], concurrency = 12): Promise<CameraWithStatus[]> {
  const out: CameraWithStatus[] = new Array(cams.length)
  let i = 0
  async function worker() {
    while (i < cams.length) {
      const idx = i++
      out[idx] = await checkCamera(cams[idx])
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, cams.length) }, worker)
  await Promise.all(workers)
  return out
}
