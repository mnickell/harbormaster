import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type FormEvent } from 'react'
import { fetchApp, updateAppFn, deleteApp } from '~/lib/server-fns'
import { useToast } from '~/hooks/useToast'

export const Route = createFileRoute('/apps/$appId/edit')({
  loader: ({ params }) => fetchApp({ data: params.appId }),
  component: EditApp,
})

function EditApp() {
  const app = Route.useLoaderData()
  const navigate = useNavigate()
  const { toast } = useToast()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    try {
      await updateAppFn({
        data: {
          id: app.id,
          fields: {
            name: fd.get('name') as string,
            repo: fd.get('repo') as string,
            branch: (fd.get('branch') as string) || 'main',
            composeDir: fd.get('composeDir') as string,
            healthCheckUrl: fd.get('healthCheckUrl') as string,
            healthCheckInterval:
              parseInt(fd.get('healthCheckInterval') as string) || 30,
            autoDeployEnabled: fd.get('autoDeployEnabled') === 'on',
          },
        },
      })
      toast('App updated')
      navigate({ to: '/apps/$appId', params: { appId: app.id } })
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this app?')) return
    try {
      await deleteApp({ data: app.id })
      toast('App deleted')
      navigate({ to: '/' })
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
          navigate({ to: '/apps/$appId', params: { appId: app.id } })
        }}
      >
        &larr; Back
      </a>
      <h2 style={{ marginBottom: '24px' }}>Edit App</h2>

      <form onSubmit={handleSubmit} style={{ maxWidth: '500px' }}>
        <div className="form-group">
          <label>Name</label>
          <input name="name" defaultValue={app.name} disabled />
        </div>
        <div className="form-group">
          <label>Repository URL</label>
          <input
            name="repo"
            defaultValue={app.repo}
            required
            placeholder="git@github.com:user/repo.git"
          />
        </div>
        <div className="form-group">
          <label>Branch</label>
          <input name="branch" defaultValue={app.branch} />
        </div>
        <div className="form-group">
          <label>Compose Directory</label>
          <input
            name="composeDir"
            defaultValue={app.composeDir}
            placeholder="/mnt/user/appdata/my-app"
          />
        </div>
        <div className="form-group">
          <label>Health Check URL</label>
          <input
            name="healthCheckUrl"
            defaultValue={app.healthCheckUrl}
            placeholder="http://192.168.1.x:3000"
          />
        </div>
        <div className="form-group">
          <label>Health Check Interval (seconds)</label>
          <input
            name="healthCheckInterval"
            type="number"
            defaultValue={app.healthCheckInterval}
            min={5}
          />
        </div>
        <div className="toggle-row">
          <label>Auto-deploy enabled</label>
          <label className="toggle">
            <input
              type="checkbox"
              name="autoDeployEnabled"
              defaultChecked={app.autoDeployEnabled}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="btn-group" style={{ marginTop: '24px' }}>
          <button type="submit" className="btn btn-primary">
            Save Changes
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDelete}
          >
            Delete App
          </button>
        </div>
      </form>
    </>
  )
}
