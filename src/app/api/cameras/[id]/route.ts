import { NextResponse } from 'next/server'
import { getCamera } from '@/lib/store'
import { checkCamera } from '@/lib/status'

// GET /api/cameras/:id  → CameraWithStatus (public, credential-free).
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cam = await getCamera(id)
  if (!cam) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const checked = await checkCamera(cam)
  return NextResponse.json(checked)
}
