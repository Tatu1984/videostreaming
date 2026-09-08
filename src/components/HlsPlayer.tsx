'use client'

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

interface Props {
  src: string
  /** When false, the player stays torn down (no network, no decode). */
  active: boolean
  /** Autoplay muted once attached (browsers require muted autoplay). */
  autoPlay?: boolean
  className?: string
  onError?: (msg: string) => void
}

/**
 * Lazy, self-cleaning HLS player.
 *
 * It attaches hls.js (or native HLS on Safari) ONLY while `active` is true. When
 * `active` flips to false — the tile scrolled out of view, the camera went
 * offline, or the focus view closed — it fully destroys the hls.js instance and
 * releases the media, so N tiles never all decode at once and hidden tiles cost
 * nothing. This is the key to not overloading the browser, the ingest, or the
 * Edge Agent when many cameras are listed.
 */
export default function HlsPlayer({ src, active, autoPlay = true, className, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Teardown helper — used on deactivate and unmount.
    const teardown = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      try {
        video.pause()
        video.removeAttribute('src')
        video.load()
      } catch {
        /* ignore */
      }
    }

    if (!active) {
      teardown()
      setStatus('idle')
      return
    }

    setStatus('loading')

    // Safari / iOS play HLS natively — no hls.js needed.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      if (autoPlay) video.play().catch(() => {})
      const onPlaying = () => setStatus('playing')
      video.addEventListener('playing', onPlaying)
      return () => {
        video.removeEventListener('playing', onPlaying)
        teardown()
      }
    }

    if (!Hls.isSupported()) {
      setStatus('error')
      onError?.('HLS not supported in this browser')
      return
    }

    const hls = new Hls({
      // Keep live latency low but tolerant; small buffers so many tiles are light.
      lowLatencyMode: true,
      backBufferLength: 10,
      maxBufferLength: 15,
      liveSyncDurationCount: 3,
      manifestLoadingTimeOut: 8000,
      // Recover gracefully from transient network blips rather than dying.
      fragLoadingMaxRetry: 6,
      manifestLoadingMaxRetry: 4,
    })
    hlsRef.current = hls
    hls.attachMedia(video)
    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(src))
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (autoPlay) video.play().catch(() => {})
    })
    video.addEventListener('playing', () => setStatus('playing'))

    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (!data.fatal) return
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          hls.startLoad() // retry (source may be reconnecting)
          break
        case Hls.ErrorTypes.MEDIA_ERROR:
          hls.recoverMediaError()
          break
        default:
          setStatus('error')
          onError?.(`playback error: ${data.details}`)
          teardown()
      }
    })

    return teardown
    // Re-run when the source or active flag changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, active])

  return (
    <div className="video-wrap">
      <video
        ref={videoRef}
        className={className}
        muted
        playsInline
        controls={status === 'playing'}
      />
      {status !== 'playing' && (
        <div className="placeholder">
          {status === 'idle' && 'Idle'}
          {status === 'loading' && 'Connecting…'}
          {status === 'error' && 'Stream unavailable'}
        </div>
      )}
    </div>
  )
}
