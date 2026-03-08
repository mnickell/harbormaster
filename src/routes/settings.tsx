import { createFileRoute, Link } from '@tanstack/react-router'
import { fetchStatus, syncFromHooks } from '~/lib/server-fns'
import { useToast } from '~/hooks/useToast'
import { useAuth } from '~/hooks/useAuth'

export const Route = createFileRoute('/settings')({
  loader: () => fetchStatus(),
  component: SettingsPage,
})

function SettingsPage() {
  const status = Route.useLoaderData()
  const { toast } = useToast()
  const { token, clearToken } = useAuth()

  async function handleSync() {
    try {
      const data = await syncFromHooks()
      toast(`Synced: ${data.total} apps imported`)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  const exportUrl = token
    ? `/api/export?token=${encodeURIComponent(token)}`
    : '/api/export'

  return (
    <>
      <Link to="/" className="back-link">
        &larr; All Apps
      </Link>
      <h2 style={{ marginBottom: '24px' }}>Settings</h2>

      <div className="settings-section">
        <h3>System</h3>
        <table className="config-table">
          <tbody>
            <tr>
              <td>Version</td>
              <td>{status.version}</td>
            </tr>
            <tr>
              <td>Uptime</td>
              <td>{Math.round(status.uptime)}s</td>
            </tr>
            <tr>
              <td>Started</td>
              <td>{status.startedAt}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="settings-section">
        <h3>Config</h3>
        <div className="btn-group">
          <a href={exportUrl} className="btn" target="_blank" rel="noopener">
            Export Config (ZIP)
          </a>
          <button className="btn" onClick={handleSync}>
            Re-sync from hooks.json
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>Authentication</h3>
        <div className="btn-group">
          <button
            className="btn"
            onClick={() => {
              clearToken()
              toast('Token cleared')
            }}
          >
            Clear Stored Token
          </button>
        </div>
      </div>
    </>
  )
}
