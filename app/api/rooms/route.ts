import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = getSupabase()
  const now = new Date().toISOString()
  // get active rooms with message counts
  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('id, slug, label, expires_at, created_at')
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // attach message counts
  const counts = await Promise.all(
    (rooms ?? []).map(async r => {
      const { count } = await supabase
        .from('messages').select('id', { count: 'exact', head: true }).eq('room_id', r.id)
      return { ...r, message_count: count ?? 0 }
    })
  )
  return NextResponse.json(counts)
}

export async function POST(req: Request) {
  const supabase = getSupabase()
  const { slug, label, duration_minutes } = await req.json()
  if (!slug?.trim()) return NextResponse.json({ error: 'slug required' }, { status: 400 })
  const clean = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 48)
  const mins = Math.min(Math.max(Number(duration_minutes) || 1440, 5), 10080) // 5min–7days
  const expires_at = new Date(Date.now() + mins * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('rooms')
    .insert({ slug: clean, label: (label || '').trim().slice(0, 80), expires_at })
    .select().single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'slug already taken' : error.message }, { status: 400 })
  return NextResponse.json(data)
}
