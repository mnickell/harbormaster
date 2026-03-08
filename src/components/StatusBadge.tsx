interface StatusBadgeProps {
  status: string
  deployLocked?: boolean
  autoDeployEnabled?: boolean
  deployInProgress?: boolean
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  up: { label: 'Up', className: 'badge-up' },
  down: { label: 'Down', className: 'badge-down' },
  degraded: { label: 'Degraded', className: 'badge-degraded' },
  deploying: { label: 'Deploying', className: 'badge-deploying' },
  unknown: { label: 'Unknown', className: 'badge-unknown' },
}

export function StatusBadge({
  status,
  deployLocked,
  autoDeployEnabled,
  deployInProgress,
}: StatusBadgeProps) {
  if (deployLocked) {
    return <span className="badge badge-locked">Locked</span>
  }
  if (autoDeployEnabled === false) {
    return <span className="badge badge-paused">Paused</span>
  }
  if (deployInProgress) {
    return <span className="badge badge-deploying">Deploying</span>
  }

  const info = STATUS_MAP[status] || STATUS_MAP.unknown
  return <span className={`badge ${info.className}`}>{info.label}</span>
}

export function ResultBadge({ result }: { result: string | null }) {
  if (!result) return null
  const className = result === 'success' ? 'badge-success' : 'badge-failed'
  return <span className={`badge ${className}`}>{result}</span>
}
