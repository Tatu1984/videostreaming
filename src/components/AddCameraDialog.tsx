'use client'

import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

interface EdgeCreds {
  ingestUrl: string
  ingestToken: string
  publishUrl: string
  cameraId: string
}

/**
 * Add a camera to the logged-in user's account. On success the server returns
 * the camera's ONE-TIME ingest credentials (URL + token) — everything the user
 * pastes into their Edge Agent's Portal Connection. The token is shown once and
 * only its hash is stored, so we display it clearly and let them copy it.
 */
export default function AddCameraDialog({ open, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creds, setCreds] = useState<EdgeCreds | null>(null)

  if (!open) return null

  function closeAll() {
    setName('')
    setGroup('')
    setError(null)
    setCreds(null)
    onClose()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('name is required')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), group: group.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
        return
      }
      setCreds(data.edgeAgent as EdgeCreds)
      onSaved() // refresh the grid behind the dialog
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="focus-backdrop" onClick={creds ? undefined : closeAll}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="fhead">
          <span className="name">{creds ? 'Camera added — configure your Edge Agent' : 'Add camera'}</span>
          <button type="button" className="close" onClick={closeAll}>
            ✕
          </button>
        </div>

        {!creds ? (
          <form onSubmit={submit}>
            <div className="dbody">
              <label>
                Name <span className="req">*</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Front Entrance" autoFocus />
              </label>
              <label>
                Group
                <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Optional (e.g. Home)" />
              </label>
              {error && <div className="err">{error}</div>}
            </div>
            <div className="dfoot">
              <button type="button" className="btn" onClick={closeAll} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn active" disabled={busy}>
                {busy ? 'Adding…' : 'Add camera'}
              </button>
            </div>
          </form>
        ) : (
          <div className="dbody">
            <div className="note-box">
              Paste these into your <b>Edge Agent → Portal Connection</b>, then add a
              camera in the agent using the <b>Camera ID</b> below. Copy the token now —
              it is shown only once.
            </div>
            <CopyRow label="Ingest URL" value={creds.ingestUrl} />
            <CopyRow label="Token (shown once)" value={creds.ingestToken} secret />
            <CopyRow label="Camera ID" value={creds.cameraId} />
            <div className="dfoot">
              <button type="button" className="btn active" onClick={closeAll}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <label>
      {label}
      <div className="copy-row">
        <input readOnly value={value} type={secret ? 'text' : 'text'} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* clipboard may be blocked; the field is selectable */
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </label>
  )
}
