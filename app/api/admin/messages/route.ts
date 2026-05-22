import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

function checkAuth(req: Request) {
  return req.headers.get('x-admin-secret') === process.env.ADMIN_SECRET
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('messages')
    .select('id, room_id, username, content, created_at, rooms(slug)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const flat = (data ?? []).map((m: Record<string, unknown>) => ({
    ...m,
    room_slug: (m.rooms as { slug?: string } | null)?.slug ?? null,
    rooms: undefined,
  }))
  return NextResponse.json(flat)
}
