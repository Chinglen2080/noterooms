import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('rooms').select('*').eq('slug', slug).single()
  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // check expiry
  if (new Date(data.expires_at) < new Date())
    return NextResponse.json({ error: 'room expired' }, { status: 410 })
  return NextResponse.json(data)
}
