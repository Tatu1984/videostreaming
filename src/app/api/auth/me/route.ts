import { NextResponse } from 'next/server'
import { readSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/auth/me → { user } or 401. Used by the client to know who's logged in.
export async function GET() {
  const s = await readSession()
  if (!s) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({ user: { id: s.userId, email: s.email } })
}
