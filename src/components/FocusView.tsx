'use client'

import { useEffect } from 'react'
import type { CameraWithStatus } from '@/lib/types'
import HlsPlayer from './HlsPlayer'
import StatusBadge from './StatusBadge'

interface Props {
  camera: CameraWithStatus | null
  onClose: () => void
}

/** Full-size single-camera view. Streams at higher priority than grid tiles. */
export default function FocusView({ camera, onClose }: Props) {
  useEffect(() => {
    if (!camera) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [camera, onClose])

  if (!camera) return null

  return (
    <div className="focus-backdrop" onClick={onClose}>
      <div className="focus" onClick={(e) => e.stopPropagation()}>
        <div className="fhead">
          <span className="name">{camera.name}</span>
          {camera.group && <span className="group" style={{ color: 'var(--muted)' }}>{camera.group}</span>}
          <StatusBadge status={camera.status} />
          <button className="close" onClick={onClose}>
            Close ✕
          </button>
        </div>
        <div className="fbody">
          {camera.available ? (
            <HlsPlayer src={camera.hlsUrl} active={true} />
          ) : (
            <div className="placeholder" style={{ padding: 60 }}>
              This camera is {camera.status.toLowerCase()} — no live feed right now.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
