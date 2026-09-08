'use client'

import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

const TOKEN_KEY = 'livefeed.adminToken'

function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}
function saveToken(t: string) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Token-gated "Add Camera" form. Viewing the portal needs no auth; registering a
 * camera is a write, so it sends the admin token (LIVEFEED_ADMIN_TOKEN) as a
 * Bearer header. The token is remembered in localStorage so the operator types
 * it once. If the server has no token configured, any value (or blank) works.
 */
export default function AddCameraDialog({ open, onClose, onSaved }: Props) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [hlsUrl, setHlsUrl] = useState('')
  const [note, setNote] = useState('')
  const [token, setToken] = useState(loadToken())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const reset = () => {
    setId('')
    setName('')
    setGroup('')
    setHlsUrl('')
    setNote('')
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!id.trim() || !name.trim() || !/^https?:\/\//.test(hlsUrl.trim())) {
      setError('id, name, and an http(s) HLS URL are required')
      return
    }
    setBusy(true)
    saveToken(token.trim())
    try {
      const res = await fetch('/api/admin/cameras', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {}),
        },
        body: JSON.stringify({
          id: id.trim(),
          name: name.trim(),
          group: group.trim() || undefined,
          hlsUrl: hlsUrl.trim(),
          note: note.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        setError('Unauthorized — check the admin token.')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `HTTP ${res.status}`)
        return
      }
      reset()
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="focus-backdrop" onClick={onClose}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="fhead">
          <span className="name">Add camera</span>
          <button type="button" className="close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="dbody">
          <label>
            Camera ID <span className="req">*</span>
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder="cam-001" />
          </label>
          <label>
            Name <span className="req">*</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Front Entrance" />
          </label>
          <label>
            Group
            <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Entrance (optional)" />
          </label>
          <label>
            HLS URL <span className="req">*</span>
            <input
              value={hlsUrl}
              onChange={(e) => setHlsUrl(e.target.value)}
              placeholder="https://ingest.example.com/api/edge/ingest/cam-001/index.m3u8"
            />
          </label>
          <label>
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </label>
          <label>
            Admin token
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Only if the server sets LIVEFEED_ADMIN_TOKEN"
            />
          </label>
          {error && <div className="err">{error}</div>}
        </div>
        <div className="dfoot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn active" disabled={busy}>
            {busy ? 'Saving…' : 'Add camera'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Delete a camera by id (used from the grid tile). Returns true on success. */
export async function deleteCamera(id: string): Promise<{ ok: boolean; error?: string }> {
  const token = loadToken()
  try {
    const res = await fetch(`/api/admin/cameras?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (res.status === 401) return { ok: false, error: 'Unauthorized — set the admin token via Add camera.' }
    return { ok: res.ok }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'request failed' }
  }
}
