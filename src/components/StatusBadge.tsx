import type { CameraStatus } from '@/lib/types'

const CLASS: Record<CameraStatus, string> = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  CONNECTING: 'connecting',
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
