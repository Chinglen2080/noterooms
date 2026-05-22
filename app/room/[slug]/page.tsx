'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Room = { id: string; slug: string; label: string; expires_at: string }
type Message = {
  id: string
  room_id: string
  reply_to: string | null
  username: string
  content: string
  created_at: string
  reply_preview?: { username: string; content: string } | null
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i
const URL_RE = /https?:\/\/[^\s]+/g

function timeAgo(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function timeLeft(expiresAt: string): string {
  const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
  if (diff <= 0) return 'expired'
  if (diff < 3600) return `${Math.floor(diff / 60)}m left`
  if (diff < 86400) return `${(diff / 3600).toFixed(1)}h left`
  return `${Math.floor(diff / 86400)}d left`
}

function randomSessionId() { return 'anon-' + Math.random().toString(36).slice(2, 6) }

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${60 * 60 * 24 * 365}; path=/; samesite=lax`
}

function renderContent(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let last = 0; let match: RegExpExecArray | null
  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const url = match[0]
    if (IMAGE_EXT.test(url)) {
      parts.push(<img key={match.index} src={url} alt="embed" loading="lazy"
        style={{ display: 'block', maxWidth: '100%', maxHeight: 280, borderRadius: 6, marginTop: '0.35rem', cursor: 'pointer' }}
        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} />)
    } else {
      parts.push(<a key={match.index} href={url} target="_blank" rel="noopener noreferrer"
        style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{url}</a>)
    }
    last = match.index + url.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const inp: React.CSSProperties = { padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--fg)', fontSize: '0.875rem', width: '100%' }

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [room, setRoom] = useState<Room | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [username, setUsername] = useState('')
  const [sessionId] = useState(randomSessionId)
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // load saved username
  useEffect(() => { setUsername(getCookie('chat_user') || '') }, [])

  // load room
  useEffect(() => {
    fetch(`/api/rooms/${slug}`)
      .then(r => r.json())
      .then(d => { if (d.error) { setNotFound(true) } else { setRoom(d) } })
  }, [slug])

  // poll messages
  useEffect(() => {
    if (!room) return
    const load = () =>
      fetch(`/api/rooms/${slug}/messages`)
        .then(r => r.json())
        .then(d => { if (Array.isArray(d)) setMessages(d) })
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [room, slug])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function setReply(msg: Message) {
    setReplyTo(msg)
    inputRef.current?.focus()
  }

  function clearReply() { setReplyTo(null) }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!msgInput.trim() || sending || !room) return
    setSending(true); setSendError('')
    const name = username.trim() || sessionId
    if (username.trim()) setCookie('chat_user', username.trim())
    const res = await fetch(`/api/rooms/${slug}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, content: msgInput.trim(), reply_to: replyTo?.id ?? null }),
    })
    const data = await res.json()
    if (!res.ok) { setSendError(data.error || 'failed to send'); setSending(false); return }
    setMsgInput(''); setReplyTo(null)
    const d = await fetch(`/api/rooms/${slug}/messages`).then(r => r.json())
    if (Array.isArray(d)) setMessages(d)
    setSending(false)
  }

  if (notFound) return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
      <p style={{ fontWeight: 600 }}>room not found or expired</p>
      <button onClick={() => router.push('/')} style={{ color: 'var(--accent)', background: 'none', border: 'none', fontSize: '0.875rem', cursor: 'pointer' }}>← back to lobby</button>
    </main>
  )

  if (!room) return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>loading...</p>
    </main>
  )

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 760, margin: '0 auto', padding: '1rem' }}>
      <header style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => router.push('/')} style={{ color: 'var(--muted)', background: 'none', border: 'none', fontSize: '0.875rem', cursor: 'pointer', padding: 0 }}>← lobby</button>
          <h1 style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.02em' }}>{room.label || room.slug}</h1>
          {room.label && <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>/{room.slug}</span>}
        </div>
        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', border: '1px solid var(--border)', borderRadius: 99, color: 'var(--muted)' }}>
          {timeLeft(room.expires_at)}
        </span>
      </header>

      {/* messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem', minHeight: 300, maxHeight: 'calc(100dvh - 220px)', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8, marginBottom: '0.75rem' }}>
        {messages.length === 0 && <p style={{ color: 'var(--muted)', margin: 'auto', fontSize: '0.875rem' }}>no messages yet. say something.</p>}
        {messages.map(m => (
          <div key={m.id} style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            {/* reply preview */}
            {m.reply_preview && (
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', borderLeft: '2px solid var(--border)', paddingLeft: '0.5rem', marginBottom: '0.25rem', opacity: 0.8 }}>
                <span style={{ fontWeight: 500, color: 'var(--accent)', marginRight: '0.3rem' }}>{m.reply_preview.username}</span>
                <span>{m.reply_preview.content.slice(0, 80)}{m.reply_preview.content.length > 80 ? '...' : ''}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 500 }}>{m.username}</span>
              <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{timeAgo(m.created_at)}</span>
              <button onClick={() => setReply(m)}
                style={{ fontSize: '0.68rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 'auto', opacity: 0.6 }}>
                reply
              </button>
            </div>
            <div style={{ fontSize: '0.875rem', marginTop: '0.1rem', wordBreak: 'break-word' }}>{renderContent(m.content)}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* reply indicator */}
      {replyTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.65rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', marginBottom: '0.4rem', fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--muted)' }}>replying to</span>
          <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{replyTo.username}</span>
          <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyTo.content.slice(0, 60)}</span>
          <button onClick={clearReply} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>✕</button>
        </div>
      )}

      {/* input */}
      <form onSubmit={sendMessage} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder={`name (blank = ${sessionId})`}
            style={{ ...inp, width: 160, flexShrink: 0 }} />
          <input ref={inputRef} value={msgInput} onChange={e => setMsgInput(e.target.value)}
            placeholder="message or image url..." style={{ ...inp, flex: 1 }} />
          <button type="submit" disabled={sending}
            style={{ padding: '0.5rem 1.1rem', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, opacity: sending ? 0.6 : 1, flexShrink: 0 }}>
            {sending ? '...' : 'send'}
          </button>
        </div>
        {sendError && <p style={{ fontSize: '0.78rem', color: 'var(--error)' }}>{sendError}</p>}
      </form>
    </main>
  )
}
