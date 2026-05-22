'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Room = {
  id: string; slug: string; label: string; expires_at: string
  has_password: boolean; password_removable: boolean
}
type Message = {
  id: string; room_id: string; reply_to: string | null
  username: string; content: string; created_at: string
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

async function deriveKey(password: string, roomSlug: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('noterooms:' + roomSlug), iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptMessage(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  const buf = new Uint8Array(12 + ct.byteLength)
  buf.set(iv, 0)
  buf.set(new Uint8Array(ct), 12)
  return btoa(String.fromCharCode(...buf))
}

async function decryptMessage(key: CryptoKey, ciphertext: string): Promise<string> {
  try {
    const buf = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
    const iv = buf.slice(0, 12)
    const ct = buf.slice(12)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    return new TextDecoder().decode(plain)
  } catch {
    return '[decryption failed]'
  }
}

const inp: React.CSSProperties = {
  padding: '0.5rem 0.75rem', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--fg)', fontSize: '0.875rem', width: '100%'
}

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [room, setRoom] = useState<Room | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({})
  const [username, setUsername] = useState('')
  const [sessionId] = useState(randomSessionId)
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [needsPassword, setNeedsPassword] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState('')
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null)
  const [authedToken, setAuthedToken] = useState<string | null>(null)

  const [showOptions, setShowOptions] = useState(false)
  const optionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setUsername(getCookie('chat_user') || '') }, [])

  useEffect(() => {
    fetch(`/api/rooms/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setNotFound(true); return }
        setRoom(d)
        if (d.has_password) {
          const cached = getCookie(`room_auth_${d.slug}`)
          const cachedPw = getCookie(`room_pw_${d.slug}`)
          if (cached && cachedPw) {
            deriveKey(cachedPw, d.slug).then(k => {
              setCryptoKey(k)
              setAuthedToken(cached)
            })
          } else {
            setNeedsPassword(true)
          }
        }
      })
  }, [slug])

  useEffect(() => {
    if (!room) return
    if (room.has_password && !authedToken) return
    const load = () =>
      fetch(`/api/rooms/${slug}/messages`)
        .then(r => r.json())
        .then(async d => {
          if (!Array.isArray(d)) return
          setMessages(d)
          if (cryptoKey) {
            const map: Record<string, string> = {}
            await Promise.all(d.map(async (m: Message) => {
              map[m.id] = await decryptMessage(cryptoKey, m.content)
            }))
            setDecryptedMessages(map)
          }
        })
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [room, slug, authedToken, cryptoKey])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node))
        setShowOptions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!pwInput.trim() || !room) return
    setPwError('')
    const name = username.trim() || sessionId
    const res = await fetch(`/api/rooms/${slug}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwInput.trim(), username: name }),
    })
    const data = await res.json()
    if (!res.ok) { setPwError(data.error || 'wrong password'); return }
    const key = await deriveKey(pwInput.trim(), slug)
    setCryptoKey(key)
    setAuthedToken(data.token)
    setCookie(`room_auth_${slug}`, data.token)
    setCookie(`room_pw_${slug}`, pwInput.trim())
    setNeedsPassword(false)
  }

  async function removeMyPassword() {
    if (!room || !authedToken) return
    const res = await fetch(`/api/rooms/${slug}/auth`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': authedToken },
    })
    if (res.ok) {
      document.cookie = `room_auth_${slug}=; max-age=0; path=/`
      document.cookie = `room_pw_${slug}=; max-age=0; path=/`
      setAuthedToken(null)
      setCryptoKey(null)
      setNeedsPassword(true)
    }
  }

  function setReply(msg: Message) { setReplyTo(msg); inputRef.current?.focus() }
  function clearReply() { setReplyTo(null) }

  function getDisplayContent(m: Message): string {
    if (cryptoKey) return decryptedMessages[m.id] ?? '...'
    return m.content
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!msgInput.trim() || sending || !room) return
    setSending(true); setSendError('')
    const name = username.trim() || sessionId
    if (username.trim()) setCookie('chat_user', username.trim())
    let content = msgInput.trim()
    if (cryptoKey) content = await encryptMessage(cryptoKey, content)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authedToken) headers['x-auth-token'] = authedToken
    const res = await fetch(`/api/rooms/${slug}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: name, content, reply_to: replyTo?.id ?? null }),
    })
    const data = await res.json()
    if (!res.ok) { setSendError(data.error || 'failed to send'); setSending(false); return }
    setMsgInput(''); setReplyTo(null)
    const d = await fetch(`/api/rooms/${slug}/messages`).then(r => r.json())
    if (Array.isArray(d)) {
      setMessages(d)
      if (cryptoKey) {
        const map: Record<string, string> = {}
        await Promise.all(d.map(async (m: Message) => {
          map[m.id] = await decryptMessage(cryptoKey, m.content)
        }))
        setDecryptedMessages(map)
      }
    }
    setSending(false)
  }

  function exportChat(format: 'json' | 'txt') {
    if (!room) return
    const exportMessages = messages.map(m => ({
      ...m,
      content: cryptoKey ? (decryptedMessages[m.id] ?? m.content) : m.content,
    }))
    let blob: Blob
    let filename: string
    if (format === 'json') {
      const payload = { room: { slug: room.slug, label: room.label, expires_at: room.expires_at }, messages: exportMessages, exported_at: new Date().toISOString() }
      blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      filename = `noterooms-${room.slug}-${Date.now()}.json`
    } else {
      const lines = [
        `room: ${room.label || room.slug} (/${room.slug})`,
        `exported: ${new Date().toLocaleString()}`,
        `expires: ${room.expires_at}`,
        '',
        ...exportMessages.map(m =>
          `[${new Date(m.created_at).toLocaleString()}] ${m.username}: ${m.reply_preview ? `(reply to ${m.reply_preview.username}: ${m.reply_preview.content.slice(0, 40)}...) ` : ''}${m.content}`
        )
      ]
      blob = new Blob([lines.join('\n')], { type: 'text/plain' })
      filename = `noterooms-${room.slug}-${Date.now()}.txt`
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
    setShowOptions(false)
  }

  if (notFound) return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
      <p style={{ fontWeight: 600 }}>room not found or expired</p>
      <button onClick={() => router.push('/')} style={{ color: 'var(--accent)', background: 'none', border: 'none', fontSize: '0.875rem', cursor: 'pointer' }}>back to lobby</button>
    </main>
  )

  if (!room) return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>loading...</p>
    </main>
  )

  if (needsPassword) return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 360, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem', background: 'var(--surface)' }}>
        <h2 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>{room.label || room.slug}</h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>this room is password protected</p>
        <form onSubmit={submitPassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>your name</label>
            <input style={inp} value={username} onChange={e => setUsername(e.target.value)}
              placeholder={`blank = ${sessionId}`} />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>password</label>
            <input style={inp} type="password" value={pwInput} onChange={e => setPwInput(e.target.value)} autoFocus />
          </div>
          {pwError && <p style={{ fontSize: '0.78rem', color: 'var(--error)' }}>{pwError}</p>}
          <button type="submit" style={{ padding: '0.5rem', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }}>enter room</button>
        </form>
        <button onClick={() => router.push('/')} style={{ marginTop: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', fontSize: '0.8rem', cursor: 'pointer' }}>back</button>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 760, margin: '0 auto', padding: '1rem' }}>
      <header style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => router.push('/')} style={{ color: 'var(--muted)', background: 'none', border: 'none', fontSize: '0.875rem', cursor: 'pointer', padding: 0 }}>back</button>
          <h1 style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.02em' }}>{room.label || room.slug}</h1>
          {room.label && <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>/{room.slug}</span>}
          {room.has_password && <span style={{ fontSize: '0.72rem', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.1rem 0.35rem' }}>e2e</span>}
        </div>
        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', border: '1px solid var(--border)', borderRadius: 99, color: 'var(--muted)' }}>
          {timeLeft(room.expires_at)}
        </span>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem', minHeight: 300, maxHeight: 'calc(100dvh - 220px)', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8, marginBottom: '0.75rem' }}>
        {messages.length === 0 && <p style={{ color: 'var(--muted)', margin: 'auto', fontSize: '0.875rem' }}>no messages yet. say something.</p>}
        {messages.map(m => {
          const displayContent = getDisplayContent(m)
          const replyContent = m.reply_preview
            ? (cryptoKey && decryptedMessages[m.reply_to ?? ''] ? decryptedMessages[m.reply_to ?? ''] : m.reply_preview.content)
            : null
          return (
            <div key={m.id} style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {m.reply_preview && (
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', borderLeft: '2px solid var(--border)', paddingLeft: '0.5rem', marginBottom: '0.25rem', opacity: 0.8 }}>
                  <span style={{ fontWeight: 500, color: 'var(--accent)', marginRight: '0.3rem' }}>{m.reply_preview.username}</span>
                  <span>{(replyContent ?? '').slice(0, 80)}{(replyContent ?? '').length > 80 ? '...' : ''}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 500 }}>{m.username}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{timeAgo(m.created_at)}</span>
                <button onClick={() => setReply(m)}
                  style={{ fontSize: '0.68rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 'auto', opacity: 0.6 }}>reply</button>
              </div>
              <div style={{ fontSize: '0.875rem', marginTop: '0.1rem', wordBreak: 'break-word' }}>
                {renderContent(displayContent)}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.65rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', marginBottom: '0.4rem', fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--muted)' }}>replying to</span>
          <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{replyTo.username}</span>
          <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(cryptoKey ? (decryptedMessages[replyTo.id] ?? replyTo.content) : replyTo.content).slice(0, 60)}
          </span>
          <button onClick={clearReply} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>x</button>
        </div>
      )}

      <form onSubmit={sendMessage} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder={`name (blank = ${sessionId})`}
            style={{ ...inp, width: 160, flexShrink: 0 }} />
          <input ref={inputRef} value={msgInput} onChange={e => setMsgInput(e.target.value)}
            placeholder="message or image url..." style={{ ...inp, flex: 1 }} />
          <button type="submit" disabled={sending}
            style={{ padding: '0.5rem 1.1rem', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, opacity: sending ? 0.6 : 1, flexShrink: 0, cursor: 'pointer' }}>
            {sending ? '...' : 'send'}
          </button>

          <div ref={optionsRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button type="button" onClick={() => setShowOptions(o => !o)} aria-label="options"
              style={{ padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', fontSize: '0.85rem', cursor: 'pointer' }}>
              ...
            </button>
            {showOptions && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', right: 0,
                minWidth: 180, border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--surface)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                zIndex: 100, overflow: 'hidden',
              }}>
                <p style={{ fontSize: '0.68rem', color: 'var(--muted)', padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>export</p>
                <button type="button" onClick={() => exportChat('json')}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', background: 'none', border: 'none', fontSize: '0.82rem', color: 'var(--fg)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  export as JSON
                </button>
                <button type="button" onClick={() => exportChat('txt')}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', background: 'none', border: 'none', fontSize: '0.82rem', color: 'var(--fg)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  export as TXT
                </button>
                {room.has_password && room.password_removable && authedToken && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)' }} />
                    <button type="button" onClick={removeMyPassword}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', background: 'none', border: 'none', fontSize: '0.82rem', color: 'var(--error)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      remove my password
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {sendError && <p style={{ fontSize: '0.78rem', color: 'var(--error)' }}>{sendError}</p>}
      </form>
    </main>
  )
}
