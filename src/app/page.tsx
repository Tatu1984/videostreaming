'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CameraView } from '@/lib/types'
import CameraTile from '@/components/CameraTile'
import FocusView from '@/components/FocusView'
import AddCameraDialog from '@/components/AddCameraDialog'

type GridSize = 'sm' | 'md' | 'lg'
const REFRESH_MS = 15000

export default function Dashboard() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [authed, setAuthed] = useState<boolean | null>(null) // null = checking
  const [cameras, setCameras] = useState<CameraView[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [size, setSize] = useState<GridSize>('md')
  const [streaming, setStreaming] = useState(true)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const fetchCameras = useCallback(async () => {
    try {
      const res = await fetch('/api/cameras', { cache: 'no-store' })
      if (res.status === 401) {
        setAuthed(false)
        return
      }
      const data = await res.json()
      setCameras(data.cameras ?? [])
    } catch {
      /* keep last known list */
    } finally {
      setLoading(false)
    }
  }, [])

  // Auth check on mount.
  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setEmail(d.user?.email ?? null)
        setAuthed(true)
      } else {
        setAuthed(false)
      }
    })()
  }, [])

  // Redirect to login when unauthenticated.
  useEffect(() => {
    if (authed === false) router.replace('/login')
  }, [authed, router])

  // Load + poll cameras once authed.
  useEffect(() => {
    if (authed !== true) return
    fetchCameras()
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => { if (!timer) timer = setInterval(fetchCameras, REFRESH_MS) }
    const stop = () => { if (timer) { clearInterval(timer); timer = null } }
    const onVis = () => (document.visibilityState === 'visible' ? (fetchCameras(), start()) : stop())
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [authed, fetchCameras])

  const groups = useMemo(() => {
    const s = new Set<string>()
    cameras.forEach((c) => c.group && s.add(c.group))
    return ['all', ...Array.from(s).sort()]
  }, [cameras])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cameras.filter((c) => {
      if (group !== 'all' && c.group !== group) return false
      if (q && !(`${c.name} ${c.group ?? ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [cameras, query, group])

  async function onDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}"? This deletes the camera from your account.`)) return
    const res = await fetch(`/api/cameras/${id}`, { method: 'DELETE' })
    if (res.ok) fetchCameras()
    else alert('Delete failed')
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
  }

  if (authed !== true) {
    return <div className="empty">{authed === null ? 'Loading…' : 'Redirecting to sign in…'}</div>
  }

  const onlineCount = cameras.filter((c) => c.available).length
  const focused = cameras.find((c) => c.id === focusId) ?? null

  return (
    <>
      <header className="header">
        <h1>Live Feed Portal</h1>
        <span className="stat">
          <b>{onlineCount}</b> live / <b>{cameras.length}</b> cameras
        </span>
        <div className="spacer" />
        <span className="stat" title="Signed in">{email}</span>
        <button className="btn" onClick={() => setAddOpen(true)}>＋ Add camera</button>
        <button
          className={`btn ${streaming ? 'active' : ''}`}
          onClick={() => setStreaming((s) => !s)}
          title="Pause all video without leaving the page"
        >
          {streaming ? '▮▮ Pause all' : '▶ Resume all'}
        </button>
        <button className="btn" onClick={logout}>Sign out</button>
      </header>

      <div className="toolbar">
        <input className="grow" placeholder="Search cameras…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => (
            <option key={g} value={g}>{g === 'all' ? 'All groups' : g}</option>
          ))}
        </select>
        <button className={`btn ${size === 'sm' ? 'active' : ''}`} onClick={() => setSize('sm')}>S</button>
        <button className={`btn ${size === 'md' ? 'active' : ''}`} onClick={() => setSize('md')}>M</button>
        <button className={`btn ${size === 'lg' ? 'active' : ''}`} onClick={() => setSize('lg')}>L</button>
      </div>

      {loading ? (
        <div className="empty">Loading cameras…</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          {cameras.length === 0
            ? 'No cameras yet. Click “＋ Add camera” to register one and get its Edge Agent credentials.'
            : 'No cameras match your filter.'}
        </div>
      ) : (
        <div className={`grid size-${size}`}>
          {filtered.map((cam) => (
            <CameraTile key={cam.id} camera={cam} streamingEnabled={streaming} onFocus={setFocusId} onDelete={onDelete} />
          ))}
        </div>
      )}

      <FocusView camera={focused} onClose={() => setFocusId(null)} />
      <AddCameraDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={fetchCameras} />
    </>
  )
}
