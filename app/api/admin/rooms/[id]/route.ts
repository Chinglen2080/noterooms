import { getSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

function checkAuth(req: Request) {
  return req.headers.get('x-admin-token') === process.env.ADMIN_TOKEN
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = getSupabase()
  const { error } = await supabase.from('rooms').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
