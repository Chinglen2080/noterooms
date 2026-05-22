import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

function checkAuth(req: Request) {
  return req.headers.get('x-admin-token') === process.env.ADMIN_TOKEN
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('rooms').select('id, slug, label, expires_at, created_at').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const counts = await Promise.all(
    (data ?? []).map(async r => {
      const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('room_id', r.id)
      return { ...r, message_count: count ?? 0 }
    })
  )
  return NextResponse.json(counts)
}
