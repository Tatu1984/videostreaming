// Public, portal-facing camera types. NOTHING here is a secret: no RTSP URL,
// no camera credentials, no ingest token. A camera's playback URL is derived
// from its ingest key and served credential-free to its OWNER only.

export type CameraStatus = 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'STOPPED' | 'UNKNOWN'

/** A camera as shown to its owner in the portal. */
export interface CameraView {
  id: string
  name: string
  group?: string | null
  /** Stream key in the ingest/playback URL path. */
  ingestKey: string
  /** Credential-free HLS playlist URL (owner-scoped playback). */
  hlsUrl: string
  status: CameraStatus
  available: boolean
  checkedAt: string
}
