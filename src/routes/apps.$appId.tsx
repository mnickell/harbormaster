import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import {
  fetchApp,
  fetchDeployHistory,
  deployApp,
  deployBranch,
  restartApp,
  toggleLock,
  toggleAutoDeploy,
  rotateSecret,
  deleteApp,
  resetPorts,
  updatePorts,
} from '~/lib/server-fns'
import { StatusBadge, ResultBadge } from '~/components/StatusBadge'
import { Sparkline } from '~/components/Sparkline'
import { LogViewer } from '~/components/LogViewer'
import { PortTable } from '~/components/PortTable'
import { Modal } from '~/components/Modal'
import { SecretModal } from '~/components/SecretModal'
import { useSSE } from '~/hooks/useSSE'
import { useToast } from '~/hooks/useToast'
import { timeAgo } from '~/lib/time'

export const Route = createFileRoute('/apps/$appId')({
  loader: async ({ params }) => {
    const [app, history] = await Promise.all([
      fetchApp({ data: params.appId }),
      fetchDeployHistory({ data: params.appId }),
    ])
    return { app, history }
  },
  component: AppDetail,
})

function AppDetail() {
  const { app: initialApp, history } = Route.useLoaderData()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [app, setApp] = useState(initialApp)
  const [liveLog, setLiveLog] = useState('')
  const [branchModalOpen, setBranchModalOpen] = useState(false)
  const [secretModal, setSecretModal] = useState<{
    open: boolean
    url: string
    secret: string
  }>({ open: false, url: '', secret: '' })
  const [logModal, setLogModal] = useState<{
    open: boolean
    deployId: string
    output: string
  }>({ open: false, deployId: '', output: '' })
  const [portEditModal, setPortEditModal] = useState(false)
  const [portValues, setPortValues] = useState<Record<number, number>>({})

  useSSE({
    url: `/api/apps/${app.id}/logs`,
    events: {
      message: (data) => {
        if (typeof data === 'string') setLiveLog((prev) => prev + data)
      },
      'deploy-complete': () => {
        // Refresh the page data
        fetchApp({ data: app.id }).then(setApp)
      },
    },
    enabled: app.deployInProgress,
  })

  const handleDeploy = useCallback(async () => {
    try {
      await deployApp({ data: app.id })
      toast('Deploy triggered')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }, [app.id, toast])

  const handleDeployBranch = useCallback(
    async (branch: string) => {
      try {
        await deployBranch({ data: { id: app.id, branch } })
        toast(`Deploying branch: ${branch}`)
        setBranchModalOpen(false)
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [app.id, toast],
  )

  const handleRestart = useCallback(async () => {
    try {
      await restartApp({ data: app.id })
      toast('Restart triggered')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }, [app.id, toast])

  const handleToggleLock = useCallback(async () => {
    try {
      await toggleLock({ data: { id: app.id, locked: !app.deployLocked } })
      toast(app.deployLocked ? 'Deploy unlocked' : 'Deploy locked')
      const updated = await fetchApp({ data: app.id })
      setApp(updated)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }, [app, toast])

  const handleTogglePause = useCallback(async () => {
    try {
      await toggleAutoDeploy({
        data: { id: app.id, enabled: !app.autoDeployEnabled },
      })
      toast(
        app.autoDeployEnabled ? 'Auto-deploy paused' : 'Auto-deploy resumed',
      )
      const updated = await fetchApp({ data: app.id })
      setApp(updated)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }, [app, toast])

  const handleRotateSecret = useCallback(async () => {
    if (!confirm('This will break the existing GitHub webhook until you update it. Continue?')) return
    try {
      const data = await rotateSecret({ data: app.id })
      setSecretModal({
        open: true,
        url: data.webhookUrl,
        secret: data.webhookSecret,
      })
      toast('Secret rotated')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }, [app.id, toast])

  const handleDelete = useCallback(async () => {
    if (!confirm('Are you sure you want to delete this app?')) return
    try {
      await deleteApp({ data: app.id })
      toast('App deleted')
      navigate({ to: '/' })
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }, [app.id, toast, navigate])

  const handleViewLog = useCallback(
    async (deployId: string) => {
      try {
        const { fetchDeployLogEntry } = await import('~/lib/server-fns')
        const data = await fetchDeployLogEntry({
          data: { appId: app.id, deployId },
        })
        setLogModal({
          open: true,
          deployId,
          output: data.output || 'No output',
        })
      } catch {}
    },
    [app.id],
  )

  const handleResetPorts = useCallback(async () => {
    try {
      const data = await resetPorts({ data: app.id })
      if (data.conflicts.length > 0) {
        toast(
          `Reset with conflicts: ${data.conflicts.map((c) => c.reason).join('; ')}`,
        )
      } else {
        toast('Ports reset to compose defaults')
      }
      const updated = await fetchApp({ data: app.id })
      setApp(updated)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }, [app.id, toast])

  const handleSavePorts = useCallback(async () => {
    try {
      const ports = (app.ports || []).map((p, i) => ({
        containerPort: p.containerPort,
        hostPort: portValues[i] ?? p.hostPort,
        protocol: p.protocol,
        service: p.service,
      }))
      const data = await updatePorts({ data: { id: app.id, ports } })
      if (data.conflicts.length > 0) {
        toast(data.conflicts.map((c) => c.reason).join('; '))
      } else {
        toast('Ports updated')
      }
      setPortEditModal(false)
      const updated = await fetchApp({ data: app.id })
      setApp(updated)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }, [app, portValues, toast])

  return (
    <>
      <Link to="/" className="back-link">
        &larr; All Apps
      </Link>

      <div className="detail-header">
        <div>
          <h2>
            {app.name}{' '}
            <StatusBadge
              status={app.status}
              deployLocked={app.deployLocked}
              autoDeployEnabled={app.autoDeployEnabled}
              deployInProgress={app.deployInProgress}
            />
          </h2>
        </div>
        <div className="btn-group">
          <button className="btn btn-sm btn-primary" onClick={handleDeploy}>
            Redeploy
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setBranchModalOpen(true)}
          >
            Deploy Branch
          </button>
          <button className="btn btn-sm" onClick={handleRestart}>
            Restart
          </button>
          <button className="btn btn-sm" onClick={handleToggleLock}>
            {app.deployLocked ? 'Unlock' : 'Lock'}
          </button>
          <button className="btn btn-sm" onClick={handleTogglePause}>
            {app.autoDeployEnabled ? 'Pause' : 'Resume'}
          </button>
          <Link
            to="/apps/$appId/edit"
            params={{ appId: app.id }}
            className="btn btn-sm"
          >
            Edit
          </Link>
          <button
            className="btn btn-sm btn-danger"
            onClick={handleRotateSecret}
          >
            Rotate Secret
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <h4>Health</h4>
          <div className="value">
            {app.responseTimeMs !== null ? `${app.responseTimeMs}ms` : '-'}
          </div>
          <Sparkline data={app.responseHistory || []} />
        </div>
        <div className="detail-card">
          <h4>Uptime (24h)</h4>
          <div className="value">
            {app.uptimePercent24h !== null ? `${app.uptimePercent24h}%` : '-'}
          </div>
        </div>
        <div className="detail-card">
          <h4>Container</h4>
          <div className="value">{app.containerState || 'unknown'}</div>
        </div>
        <div className="detail-card">
          <h4>Last Deploy</h4>
          <div className="value-sm">
            {timeAgo(app.lastDeployAt)}{' '}
            <ResultBadge result={app.lastDeployResult} />
          </div>
          {app.lastCommitSha && (
            <div
              className="value-sm"
              style={{ marginTop: '4px', color: 'var(--text-muted)' }}
            >
              {app.lastCommitSha} — {app.lastCommitMessage || ''} (
              {app.lastCommitAuthor || ''})
            </div>
          )}
        </div>
      </div>

      <div className="detail-card" style={{ marginBottom: '16px' }}>
        <h4>Configuration</h4>
        <table className="config-table">
          <tbody>
            <tr><td>App ID</td><td>{app.id}</td></tr>
            <tr><td>Repo</td><td>{app.repo}</td></tr>
            <tr><td>Branch</td><td>{app.branch}</td></tr>
            <tr><td>Compose Dir</td><td>{app.composeDir}</td></tr>
            <tr><td>Health Check</td><td>{app.healthCheckUrl || '-'}</td></tr>
            <tr><td>Check Interval</td><td>{app.healthCheckInterval}s</td></tr>
            <tr><td>Auto-deploy</td><td>{app.autoDeployEnabled ? 'Enabled' : 'Disabled'}</td></tr>
            <tr><td>Deploy Lock</td><td>{app.deployLocked ? 'Locked' : 'Unlocked'}</td></tr>
          </tbody>
        </table>
      </div>

      <PortTable
        ports={app.ports || []}
        onEdit={() => {
          const values: Record<number, number> = {}
          ;(app.ports || []).forEach((p, i) => {
            values[i] = p.hostPort
          })
          setPortValues(values)
          setPortEditModal(true)
        }}
        onReset={handleResetPorts}
      />

      {app.deployInProgress && (
        <div className="detail-card" style={{ marginBottom: '16px' }}>
          <h4>Live Deploy Output</h4>
          <LogViewer content={liveLog} live />
        </div>
      )}

      <div className="detail-card">
        <h4>Deploy History</h4>
        <div className="deploy-list">
          {history.length === 0 ? (
            <div style={{ padding: '12px', color: 'var(--text-muted)' }}>
              No deploys yet
            </div>
          ) : (
            history.map((d) => (
              <div
                key={d.deployId}
                className="deploy-row"
                onClick={() => handleViewLog(d.deployId)}
              >
                <ResultBadge result={d.result} />
                <span className="time">{d.timestamp}</span>
                <span className="duration">{d.duration}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Branch deploy modal */}
      <Modal open={branchModalOpen} onClose={() => setBranchModalOpen(false)}>
        <h3>Deploy Branch</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.currentTarget)
            handleDeployBranch(formData.get('branch') as string)
          }}
        >
          <div className="form-group">
            <label>Branch name</label>
            <input name="branch" required placeholder="feature/my-branch" />
          </div>
          <div className="btn-group" style={{ marginTop: '16px' }}>
            <button type="submit" className="btn btn-primary">
              Deploy
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setBranchModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Secret modal */}
      <SecretModal
        open={secretModal.open}
        onClose={() => setSecretModal({ open: false, url: '', secret: '' })}
        webhookUrl={secretModal.url}
        webhookSecret={secretModal.secret}
      />

      {/* Deploy log modal */}
      <Modal
        open={logModal.open}
        onClose={() => setLogModal({ open: false, deployId: '', output: '' })}
      >
        <h3>Deploy {logModal.deployId}</h3>
        <LogViewer content={logModal.output} />
        <div style={{ marginTop: '16px', textAlign: 'right' }}>
          <button
            className="btn"
            onClick={() =>
              setLogModal({ open: false, deployId: '', output: '' })
            }
          >
            Close
          </button>
        </div>
      </Modal>

      {/* Port edit modal */}
      <Modal open={portEditModal} onClose={() => setPortEditModal(false)}>
        <h3>Edit Port Mappings</h3>
        <div
          style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            marginBottom: '12px',
          }}
        >
          Container Port : Host Port
        </div>
        {(app.ports || []).map((p, i) => (
          <div
            key={i}
            className="form-group"
            style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            <span style={{ minWidth: '60px', color: 'var(--text-muted)' }}>
              {p.containerPort}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>:</span>
            <input
              type="number"
              value={portValues[i] ?? p.hostPort}
              min={1025}
              style={{ width: '100px' }}
              onChange={(e) =>
                setPortValues((prev) => ({
                  ...prev,
                  [i]: parseInt(e.target.value) || p.hostPort,
                }))
              }
            />
            <span style={{ color: 'var(--text-muted)' }}>
              {(p.protocol || 'tcp').toUpperCase()}
            </span>
          </div>
        ))}
        <div className="btn-group" style={{ marginTop: '16px' }}>
          <button className="btn btn-primary" onClick={handleSavePorts}>
            Save
          </button>
          <button className="btn" onClick={() => setPortEditModal(false)}>
            Cancel
          </button>
        </div>
      </Modal>
    </>
  )
}
