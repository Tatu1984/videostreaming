'use client'

import { useEffect, useRef, useState } from 'react'
import type { CameraView } from '@/lib/types'
import HlsPlayer from './HlsPlayer'
import StatusBadge from './StatusBadge'

interface Props {
  camera: CameraView
  streamingEnabled: boolean
  onFocus: (id: string) => void
  onDelete: (id: string, name: string) => void
}

/**
 * One camera in the grid. The stream attaches ONLY when the tile is on-screen,
 * the tab is visible, the camera is live, and global streaming is on — so a wall
 * of cameras never all decode at once.
 */
export default function CameraTile({ camera, streamingEnabled, onFocus, onDelete }: Props) {
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
              {camera.status === 'CONNECTING' ? 'Connecting…' : 'Offline'}
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
          onClick={(e) => {
            e.stopPropagation()
            onDelete(camera.id, camera.name)
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
