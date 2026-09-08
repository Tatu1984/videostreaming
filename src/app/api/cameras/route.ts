import { NextResponse } from 'next/server'
import { listCameras } from '@/lib/store'
import { checkAll } from '@/lib/status'

// GET /api/cameras
//   → { cameras: CameraWithStatus[] }
// Public, credential-free. Returns each camera's id/name/group/hlsUrl plus a
// live status. Carries NO secrets (no RTSP URL, no token). `?status=false` skips
// the (slower) liveness probe and returns registry entries only.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const withStatus = url.searchParams.get('status') !== 'false'
  const cams = await listCameras()

  if (!withStatus) {
    return NextResponse.json({
      cameras: cams.map((c) => ({ ...c, status: 'UNKNOWN', available: false, checkedAt: '' })),
    })
  }
  const checked = await checkAll(cams)
  return NextResponse.json({ cameras: checked })
}
