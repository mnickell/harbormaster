import type { PortMapping } from '~/services/registry'

interface PortTableProps {
  ports: PortMapping[]
  onEdit?: () => void
  onReset?: () => void
}

export function PortTable({ ports, onEdit, onReset }: PortTableProps) {
  if (!ports || ports.length === 0) {
    return (
      <div className="detail-card" style={{ marginBottom: '16px' }}>
        <h4>Ports</h4>
        <div style={{ padding: '8px 0', color: 'var(--text-muted)' }}>
          No ports detected. Set a compose directory to auto-discover ports.
        </div>
      </div>
    )
  }

  return (
    <div className="detail-card" style={{ marginBottom: '16px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <h4>Ports</h4>
        <div className="btn-group">
          {onEdit && (
            <button className="btn btn-sm" onClick={onEdit}>
              Edit Ports
            </button>
          )}
          {onReset && (
            <button className="btn btn-sm" onClick={onReset}>
              Reset to Defaults
            </button>
          )}
        </div>
      </div>
      <table className="config-table">
        <thead>
          <tr style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            <td>Container Port</td>
            <td>Host Port</td>
            <td>Protocol</td>
            <td>Override</td>
          </tr>
        </thead>
        <tbody>
          {ports.map((p, i) => (
            <tr key={i}>
              <td>{p.containerPort}</td>
              <td>{p.hostPort}</td>
              <td>{(p.protocol || 'tcp').toUpperCase()}</td>
              <td>
                {p.overridden ? (
                  <span className="badge badge-locked">Override</span>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
