// Public, portal-facing camera types. NOTHING here is a secret: no RTSP URL,
// no camera credentials, no ingest token. The portal only ever knows a camera's
// identity, a display name, and a credential-free HLS playback URL.

export type CameraStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'CONNECTING'
  | 'RECONNECTING'
  | 'STALLED'
  | 'IDLE'
  | 'STOPPED'
  | 'FAILED'
  | 'UNKNOWN'

/** A camera as stored in the portal's own registry. */
export interface Camera {
  /** Stable identifier (matches the edge agent's cameraId when integrated). */
  id: string
  /** Human-facing label. */
  name: string
  /** Optional logical grouping (site / zone / area) for filtering. */
  group?: string
  /**
   * Credential-free HLS playlist URL the browser can play directly, e.g.
   * https://ingest.example.com/api/edge/ingest/<streamKey>/index.m3u8
   * This carries NO secret — playback is credential-free by design.
   */
  hlsUrl: string
  /** Optional free-text note (location, lens, etc.). */
  note?: string
}

/** A camera plus a live status the portal computes/reports. */
export interface CameraWithStatus extends Camera {
  status: CameraStatus
  /** True when the feed is currently live and playable. */
  available: boolean
  /** RFC3339 timestamp the status was last evaluated. */
  checkedAt: string
}
