import type { Camera } from './types'

// Default camera registry used on first run when no data file and no CAMERAS_JSON
// env var are present. Replace these with your real cameras (via the admin API,
// by editing data/cameras.json, or by setting CAMERAS_JSON).
//
// Each hlsUrl must be a real, credential-free HLS playlist produced by the Edge
// Agent → cloud ingest path, e.g.:
//   <ingestBase>/api/edge/ingest/<streamKey>/index.m3u8
//
// These placeholders point at a local ingest so the portal renders and behaves
// correctly (cameras show OFFLINE until a real feed exists — NOT fake video).
const INGEST = process.env.NEXT_PUBLIC_INGEST_BASE || 'http://localhost:3000'

export const seedCameras: Camera[] = [
  {
    id: 'cam-001',
    name: 'Front Entrance',
    group: 'Entrance',
    hlsUrl: `${INGEST}/api/edge/ingest/cam-001/index.m3u8`,
    note: 'Placeholder — replace with a real HLS playlist URL.',
  },
  {
    id: 'cam-002',
    name: 'Parking Bay A',
    group: 'Parking',
    hlsUrl: `${INGEST}/api/edge/ingest/cam-002/index.m3u8`,
    note: 'Placeholder — replace with a real HLS playlist URL.',
  },
]
