'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Room = {
  id: string
  slug: string
  label: string
  expires_at: string
  created_at: string
  message_count?: number
}

type Message = {
  id: string
  room_id: string
  username: string
  content: string
  created_at: string
  room_slug?: string
}

function timeLeft(expiresAt: string): string {
  const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
  if (diff <= 0) return 'expired'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${(diff / 3600).toFixed(1)}h`
  return `${Math.floor(diff / 86400)}d`
}

const s = {
  page: { minHeight: '100dvh', maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' } as React.CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', background: 'var(--surface)', marginBottom: '1rem' } as React.CSSProperties,
  label: { fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.5rem', display: 'block' } as React.CSSProperties,
  inp: { padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--fg)', fontSize: '0.875rem' } as React.CSSProperties,
  btn: (accent = false) => ({ padding: '0.4rem 0.9rem', borderRadius: 6, border: `1px solid ${accent ? 'transparent' : 'var(--border)'}`, background: accent ? 'var(--accent)' : 'transparent', color: accent ? '#fff' : 'var(--muted)', fontSize: '0.78rem', fontFamily: 'inherit', cursor: 'pointer' } as React.CSSProperties),
  dangerBtn: { padding: '0.3rem 0.7rem', borderRadius: 5, border: '1px solid var(--error)', background: 'transparent', color: 'var(--error)', fontSize: '0.75rem', fontFamily: 'inherit', cursor: 'pointer' } as React.CSSProperties,
}

export default function AdminPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [pwErr, setPwErr] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [recentMsgs, setRecentMsgs] = useState<Message[]>([])
  const [activeTab, setActiveTab] = useState<'rooms' | 'messages'>('rooms')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState('')

  async function login(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: pw }),
    })
    if (res.ok) { setAuthed(true) }
    else { setPwErr('wrong password') }
  }

  useEffect(() => {
    if (!authed) return
    fetch('/api/admin/rooms', { headers: { 'x-admin-secret': pw } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setRooms(d) })
    fetch('/api/admin/messages', { headers: { 'x-admin-secret': pw } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setRecentMsgs(d) })
  }, [authed, pw])

  async function deleteRoom(roomId: string) {
    const res = await fetch(`/api/admin/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { 'x-admin-secret': pw },
    })
    if (res.ok) {
      setRooms(r => r.filter(x => x.id !== roomId))
      setActionMsg('room deleted')
      setDeleteConfirm(null)
    }
  }

  async function deleteMessage(msgId: string) {
    const res = await fetch(`/api/admin/messages/${msgId}`, {
      method: 'DELETE',
      headers: { 'x-admin-secret': pw },
    })
    if (res.ok) {
      setRecentMsgs(m => m.filter(x => x.id !== msgId))
      setActionMsg('message deleted')
    }
  }

  if (!authed) return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
      <h1 style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>admin</h1>
      <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: 280 }}>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          placeholder="admin secret" style={{ ...s.inp, width: '100%' }} autoFocus />
        {pwErr && <p style={{ fontSize: '0.8rem', color: 'var(--error)' }}>{pwErr}</p>}
        <button type="submit" style={{ ...s.btn(true), width: '100%' }}>enter</button>
      </form>
    </main>
  )

  return (
    <main style={s.page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => router.push('/')} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}>← lobby</button>
          <h1 style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>admin</h1>
        </div>
        {actionMsg && <span style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>{actionMsg}</span>}
      </div>

      {/* stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.6rem', marginBottom: '1.5rem' }}>
        {[['total rooms', rooms.length], ['active rooms', rooms.filter(r => new Date(r.expires_at) > new Date()).length], ['expired rooms', rooms.filter(r => new Date(r.expires_at) <= new Date()).length], ['recent messages', recentMsgs.length]].map(([k, v]) => (
          <div key={k as string} style={{ ...s.card, padding: '0.85rem', marginBottom: 0 }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.1rem' }}>{k}</p>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
        {(['rooms', 'messages'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ ...s.btn(activeTab === t), borderColor: activeTab === t ? 'transparent' : 'var(--border)' }}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'rooms' && (
        <div>
          {rooms.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>no rooms</p>}
          {rooms.map(room => (
            <div key={room.id} style={s.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{room.label || room.slug}</span>
                  {room.label && <span style={{ color: 'var(--muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>/{room.slug}</span>}
                  <span style={{ fontSize: '0.72rem', marginLeft: '0.6rem', color: new Date(room.expires_at) > new Date() ? 'var(--accent)' : 'var(--error)' }}>
                    {timeLeft(room.expires_at)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{room.message_count ?? 0} msgs</span>
                  <button onClick={() => router.push(`/room/${room.slug}`)} style={s.btn()}>open</button>
                  {deleteConfirm === room.id ? (
                    <>
                      <button onClick={() => deleteRoom(room.id)} style={s.dangerBtn}>confirm delete</button>
                      <button onClick={() => setDeleteConfirm(null)} style={s.btn()}>cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setDeleteConfirm(room.id)} style={s.dangerBtn}>delete</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'messages' && (
        <div>
          {recentMsgs.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>no messages</p>}
          {recentMsgs.map(msg => (
            <div key={msg.id} style={{ ...s.card, display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                  <span style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 500 }}>{msg.username}</span>
                  {msg.room_slug && <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>in /{msg.room_slug}</span>}
                  <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                <p style={{ fontSize: '0.875rem', wordBreak: 'break-word' }}>{msg.content}</p>
              </div>
              <button onClick={() => deleteMessage(msg.id)} style={s.dangerBtn}>delete</button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
