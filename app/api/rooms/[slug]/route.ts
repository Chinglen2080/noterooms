import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('rooms')
    .select('id, slug, label, expires_at, room_passwords, password_removable')
    .eq('slug', slug).single()
  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (new Date(data.expires_at) < new Date())
    return NextResponse.json({ error: 'room expired' }, { status: 410 })
  const { room_passwords, ...rest } = data
  return NextResponse.json({
    ...rest,
    has_password: Array.isArray(room_passwords) && room_passwords.length > 0,
    password_removable: data.password_removable ?? true,
  })
}
