import { NextResponse } from 'next/server'
import { readSession } from '@/lib/auth'
import { rotateCameraToken } from '@/lib/repo'

export const dynamic = 'force-dynamic'

// POST /api/cameras/:id/rotate → issue a new ingest token (revokes the old one).
// Returns the new token ONCE. Owner-scoped.
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const token = await rotateCameraToken(s.userId, id)
  if (!token) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ingestToken: token })
}
