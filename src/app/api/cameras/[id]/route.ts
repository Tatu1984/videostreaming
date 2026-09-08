import { NextResponse } from 'next/server'
import { readSession } from '@/lib/auth'
import { getUserCamera, deleteCamera } from '@/lib/repo'
import { toView } from '@/lib/status'

export const dynamic = 'force-dynamic'

// GET /api/cameras/:id → one of the user's cameras + status (404 if not theirs).
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const cam = await getUserCamera(s.userId, id)
  if (!cam) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') || new URL(request.url).origin
  return NextResponse.json(await toView(cam, base))
}

// DELETE /api/cameras/:id → remove the user's camera (owner-scoped).
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const removed = await deleteCamera(s.userId, id)
  return NextResponse.json({ removed }, { status: removed ? 200 : 404 })
}
