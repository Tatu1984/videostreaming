'use client'

import { useEffect, useRef, useState } from 'react'
import type { CameraWithStatus } from '@/lib/types'
import HlsPlayer from './HlsPlayer'
import StatusBadge from './StatusBadge'
import { deleteCamera } from './AddCameraDialog'

interface Props {
  camera: CameraWithStatus
  /** Global "play visible tiles" toggle; when false, nothing streams. */
  streamingEnabled: boolean
  onFocus: (id: string) => void
  onDeleted: () => void
}

/**
 * One camera in the grid. The stream attaches ONLY when the tile is both
 * on-screen (IntersectionObserver), available (live), the page/tab is visible,
 * and global streaming is enabled. Scroll it away or hide the tab and the player
 * tears down — so a wall of cameras never all decode at once.
 */
export default function CameraTile({ camera, streamingEnabled, onFocus, onDeleted }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [onScreen, setOnScreen] = useState(false)
  const [tabVisible, setTabVisible] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => setOnScreen(entries[0]?.isIntersecting ?? false),
      { rootMargin: '150px', threshold: 0.1 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const active = streamingEnabled && onScreen && tabVisible && camera.available

  return (
    <div className="tile" ref={ref}>
      <div onClick={() => onFocus(camera.id)} style={{ cursor: 'pointer' }}>
        {camera.available ? (
          <HlsPlayer src={camera.hlsUrl} active={active} />
        ) : (
          <div className="video-wrap">
            <div className="placeholder">
              {camera.status === 'CONNECTING' || camera.status === 'RECONNECTING'
                ? 'Connecting…'
                : 'Offline'}
            </div>
          </div>
        )}
      </div>
      <div className="meta">
        <span className="name" title={camera.name}>
          {camera.name}
        </span>
        {camera.group && <span className="group">{camera.group}</span>}
        <StatusBadge status={camera.status} />
        <button
          className="del"
          title="Remove camera"
          onClick={async (e) => {
            e.stopPropagation()
            if (!confirm(`Remove "${camera.name}" from the portal?`)) return
            const res = await deleteCamera(camera.id)
            if (!res.ok) alert(res.error || 'Delete failed')
            else onDeleted()
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
