import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, type FormEvent } from 'react'
import { createApp, parseComposePortsFn } from '~/lib/server-fns'
import { SecretModal } from '~/components/SecretModal'
import { useToast } from '~/hooks/useToast'
import type { PortMapping } from '~/services/registry'

export const Route = createFileRoute('/apps/new')({
  component: AddApp,
})

function AddApp() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [secretModal, setSecretModal] = useState<{
    open: boolean
    appId: string
    url: string
    secret: string
  }>({ open: false, appId: '', url: '', secret: '' })
  const [discoveredPorts, setDiscoveredPorts] = useState<PortMapping[]>([])
  const parseTimeout = useRef<ReturnType<typeof setTimeout>>()

  function handleComposeDirChange(dir: string) {
    clearTimeout(parseTimeout.current)
    if (!dir.trim()) {
      setDiscoveredPorts([])
      return
    }
    parseTimeout.current = setTimeout(async () => {
      try {
        const data = await parseComposePortsFn({ data: dir.trim() })
        setDiscoveredPorts(data.ports)
      } catch {
        setDiscoveredPorts([])
      }
    }, 500)
  }

  useEffect(() => {
    return () => clearTimeout(parseTimeout.current)
  }, [])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    try {
      const data = await createApp({
        data: {
          name: fd.get('name') as string,
          repo: fd.get('repo') as string,
          branch: (fd.get('branch') as string) || 'main',
          composeDir: fd.get('composeDir') as string,
          healthCheckUrl: fd.get('healthCheckUrl') as string,
          healthCheckInterval: parseInt(fd.get('healthCheckInterval') as string) || 30,
          autoDeployEnabled: fd.get('autoDeployEnabled') === 'on',
        },
      })

      if (data.portConflicts.length > 0) {
        toast(data.portConflicts.map((c) => c.reason).join('; '))
      }

      setSecretModal({
        open: true,
        appId: data.app.id,
        url: data.webhookUrl,
        secret: data.webhookSecret,
      })
      toast('App created')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <>
      <a
        href="#"
        className="back-link"
        onClick={(e) => {
          e.preventDefault()
          navigate({ to: '/' })
        }}
      >
        &larr; All Apps
      </a>
      <h2 style={{ marginBottom: '24px' }}>Add App</h2>

      <form onSubmit={handleSubmit} style={{ maxWidth: '500px' }}>
        <div className="form-group">
          <label>Name</label>
          <input name="name" required />
          <div className="help">Used to generate the app ID (slug)</div>
        </div>
        <div className="form-group">
          <label>Repository URL</label>
          <input
            name="repo"
            required
            placeholder="git@github.com:user/repo.git"
          />
        </div>
        <div className="form-group">
          <label>Branch</label>
          <input name="branch" defaultValue="main" />
        </div>
        <div className="form-group">
          <label>Compose Directory</label>
          <input
            name="composeDir"
            placeholder="/mnt/user/appdata/my-app"
            onChange={(e) => handleComposeDirChange(e.target.value)}
          />
          <div className="help">
            Ports will be auto-discovered from docker-compose.yml
          </div>
        </div>

        {discoveredPorts.length > 0 && (
          <div className="detail-card" style={{ marginBottom: '16px' }}>
            <h4
              style={{
                fontSize: '12px',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '8px',
              }}
            >
              Discovered Ports
            </h4>
            <table className="config-table">
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  <td>Container</td>
                  <td>Host</td>
                  <td>Protocol</td>
                </tr>
              </thead>
              <tbody>
                {discoveredPorts.map((p, i) => (
                  <tr key={i}>
                    <td>{p.containerPort}</td>
                    <td>{p.hostPort || <em>auto-assign</em>}</td>
                    <td>{(p.protocol || 'tcp').toUpperCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="help" style={{ marginTop: '8px' }}>
              Conflicts will be auto-resolved on save.
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Health Check URL</label>
          <input
            name="healthCheckUrl"
            placeholder="http://192.168.1.x:3000"
          />
        </div>
        <div className="form-group">
          <label>Health Check Interval (seconds)</label>
          <input
            name="healthCheckInterval"
            type="number"
            defaultValue={30}
            min={5}
          />
        </div>
        <div className="toggle-row">
          <label>Auto-deploy enabled</label>
          <label className="toggle">
            <input type="checkbox" name="autoDeployEnabled" defaultChecked />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="btn-group" style={{ marginTop: '24px' }}>
          <button type="submit" className="btn btn-primary">
            Create App
          </button>
        </div>
      </form>

      <SecretModal
        open={secretModal.open}
        onClose={() => {
          setSecretModal({ open: false, appId: '', url: '', secret: '' })
          if (secretModal.appId) {
            navigate({
              to: '/apps/$appId',
              params: { appId: secretModal.appId },
            })
          }
        }}
        webhookUrl={secretModal.url}
        webhookSecret={secretModal.secret}
      />
    </>
  )
}
