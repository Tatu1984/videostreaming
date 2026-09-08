import type { CameraStatus } from '@/lib/types'

const CLASS: Record<CameraStatus, string> = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  FAILED: 'failed',
  CONNECTING: 'connecting',
  RECONNECTING: 'reconnecting',
  STALLED: 'stalled',
  IDLE: '',
  STOPPED: '',
  UNKNOWN: '',
}

export default function StatusBadge({ status }: { status: CameraStatus }) {
  return (
    <span className={`badge ${CLASS[status] || ''}`}>
      <span className="dot" />
      {status}
    </span>
  )
}
