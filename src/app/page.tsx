'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CameraWithStatus } from '@/lib/types'
import CameraTile from '@/components/CameraTile'
import FocusView from '@/components/FocusView'
import AddCameraDialog from '@/components/AddCameraDialog'

type GridSize = 'sm' | 'md' | 'lg'
const REFRESH_MS = 15000

export default function Dashboard() {
  const [cameras, setCameras] = useState<CameraWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [size, setSize] = useState<GridSize>('md')
  const [streaming, setStreaming] = useState(true)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const fetchCameras = useCallback(async () => {
    try {
      const res = await fetch('/api/cameras', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setCameras(data.cameras ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load cameras')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + periodic status refresh (only while the tab is visible, so a
  // backgrounded portal doesn't keep polling).
  useEffect(() => {
    fetchCameras()
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (!timer) timer = setInterval(fetchCameras, REFRESH_MS)
    }
    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVis = () => (document.visibilityState === 'visible' ? (fetchCameras(), start()) : stop())
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [fetchCameras])

  const groups = useMemo(() => {
    const s = new Set<string>()
    cameras.forEach((c) => c.group && s.add(c.group))
    return ['all', ...Array.from(s).sort()]
  }, [cameras])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cameras.filter((c) => {
      if (group !== 'all' && c.group !== group) return false
      if (q && !(`${c.name} ${c.id} ${c.group ?? ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [cameras, query, group])

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
        <button className="btn" onClick={() => setAddOpen(true)} title="Register a camera">
          ＋ Add camera
        </button>
        <button
          className={`btn ${streaming ? 'active' : ''}`}
          onClick={() => setStreaming((s) => !s)}
          title="Pause all video without leaving the page"
        >
          {streaming ? '▮▮ Pause all' : '▶ Resume all'}
        </button>
      </header>

      <div className="toolbar">
        <input
          className="grow"
          placeholder="Search cameras…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g === 'all' ? 'All groups' : g}
            </option>
          ))}
        </select>
        <button className={`btn ${size === 'sm' ? 'active' : ''}`} onClick={() => setSize('sm')}>
          S
        </button>
        <button className={`btn ${size === 'md' ? 'active' : ''}`} onClick={() => setSize('md')}>
          M
        </button>
        <button className={`btn ${size === 'lg' ? 'active' : ''}`} onClick={() => setSize('lg')}>
          L
        </button>
      </div>

      {loading ? (
        <div className="empty">Loading cameras…</div>
      ) : error ? (
        <div className="empty">Could not load cameras: {error}</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          {cameras.length === 0
            ? 'No cameras registered yet. Click “＋ Add camera” to register one.'
            : 'No cameras match your filter.'}
        </div>
      ) : (
        <div className={`grid size-${size}`}>
          {filtered.map((cam) => (
            <CameraTile
              key={cam.id}
              camera={cam}
              streamingEnabled={streaming}
              onFocus={setFocusId}
              onDeleted={fetchCameras}
            />
          ))}
        </div>
      )}

      <FocusView camera={focused} onClose={() => setFocusId(null)} />
      <AddCameraDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={fetchCameras} />
    </>
  )
}
