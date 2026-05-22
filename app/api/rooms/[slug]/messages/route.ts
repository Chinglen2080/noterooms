import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

async function getRoom(supabase: ReturnType<typeof getSupabase>, slug: string) {
  const { data } = await supabase.from('rooms').select('id, expires_at').eq('slug', slug).single()
  return data
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = getSupabase()
  const room = await getRoom(supabase, slug)
  if (!room) return NextResponse.json({ error: 'room not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('messages')
    .select('id, room_id, reply_to, username, content, created_at')
    .eq('room_id', room.id)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // attach reply previews
  const replyIds = (data ?? []).map(m => m.reply_to).filter(Boolean) as string[]
  let replyMap: Record<string, { username: string; content: string }> = {}
  if (replyIds.length > 0) {
    const { data: parents } = await supabase
      .from('messages').select('id, username, content').in('id', replyIds)
    for (const p of parents ?? []) replyMap[p.id] = { username: p.username, content: p.content }
  }

  const enriched = (data ?? []).map(m => ({
    ...m,
    reply_preview: m.reply_to ? (replyMap[m.reply_to] ?? null) : null,
  }))
  return NextResponse.json(enriched)
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = getSupabase()
  const room = await getRoom(supabase, slug)
  if (!room) return NextResponse.json({ error: 'room not found' }, { status: 404 })
  if (new Date(room.expires_at) < new Date())
    return NextResponse.json({ error: 'room has expired' }, { status: 410 })

  const { username, content, reply_to } = await req.json()
  if (!username?.trim() || !content?.trim())
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })

  const { data, error } = await supabase
    .from('messages')
    .insert({ room_id: room.id, username: username.trim(), content: content.trim(), reply_to: reply_to ?? null })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
