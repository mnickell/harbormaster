import { createFileRoute, Link } from '@tanstack/react-router'
import { fetchPortMap, fetchApps } from '~/lib/server-fns'

export const Route = createFileRoute('/ports')({
  loader: async () => {
    const [portMap, apps] = await Promise.all([
      fetchPortMap(),
      fetchApps(),
    ])
    return { portMap, apps }
  },
  component: PortMapPage,
})

function PortMapPage() {
  const { portMap, apps } = Route.useLoaderData()

  const appMap: Record<string, (typeof apps)[0]> = {}
  for (const a of apps) {
    appMap[a.id] = a
    for (const p of a.ports || []) {
      if (p.hostPort && !portMap[p.hostPort]) {
        portMap[p.hostPort] = a.id
      }
    }
  }

  const entries = Object.entries(portMap)
    .map(([port, owner]) => ({ port: parseInt(port), owner: owner as string }))
    .sort((a, b) => a.port - b.port)

  return (
    <>
      <Link to="/" className="back-link">
        &larr; All Apps
      </Link>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <h2>Port Map</h2>
      </div>

      <div className="detail-card">
        <table className="config-table">
          <thead>
            <tr style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              <td>Host Port</td>
              <td>App</td>
              <td>Container Port</td>
              <td>Protocol</td>
              <td>Source</td>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ color: 'var(--text-muted)' }}
                >
                  No ports detected
                </td>
              </tr>
            ) : (
              entries.map(({ port, owner }) => {
                const isExternal = owner.startsWith('external:')
                const name = isExternal
                  ? owner.replace('external:', '')
                  : owner
                const app = !isExternal ? appMap[owner] : null
                const portInfo = app?.ports?.find(
                  (p) => p.hostPort === port,
                )

                return (
                  <tr key={port}>
                    <td>
                      <strong>{port}</strong>
                    </td>
                    <td>
                      {isExternal ? (
                        name
                      ) : (
                        <Link
                          to="/apps/$appId"
                          params={{ appId: owner }}
                        >
                          {app?.name || owner}
                        </Link>
                      )}
                    </td>
                    <td>{portInfo ? portInfo.containerPort : '-'}</td>
                    <td>
                      {portInfo
                        ? (portInfo.protocol || 'tcp').toUpperCase()
                        : '-'}
                    </td>
                    <td>
                      {isExternal ? (
                        <span className="badge badge-muted">External</span>
                      ) : portInfo?.overridden ? (
                        <span className="badge badge-locked">Override</span>
                      ) : (
                        <span className="badge badge-up">Managed</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
