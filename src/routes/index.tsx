import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import { fetchApps, deployApp, restartApp } from '~/lib/server-fns'
import { StatusBadge, ResultBadge } from '~/components/StatusBadge'
import { useSSE } from '~/hooks/useSSE'
import { useToast } from '~/hooks/useToast'
import { timeAgo } from '~/lib/time'
import type { AppState } from '~/services/state'

export const Route = createFileRoute('/')({
  loader: () => fetchApps(),
  component: AppGrid,
})

function AppGrid() {
  const initialApps = Route.useLoaderData()
  const { toast } = useToast()
  const [liveStates, setLiveStates] = useState<Record<string, Partial<AppState>>>({})

  useSSE({
    url: '/api/events',
    events: {
      'initial-state': (data) => setLiveStates(data as Record<string, Partial<AppState>>),
      'status-change': (data) => {
        const evt = data as { appId: string; to: string }
        setLiveStates((prev) => ({
          ...prev,
          [evt.appId]: { ...prev[evt.appId], status: evt.to },
        }))
      },
      'deploy-start': (data) => {
        const evt = data as { appId: string }
        setLiveStates((prev) => ({
          ...prev,
          [evt.appId]: {
            ...prev[evt.appId],
            deployInProgress: true,
            status: 'deploying',
          },
        }))
      },
      'deploy-complete': (data) => {
        const evt = data as {
          appId: string
          result: string
          timestamp: string
          lastCommitSha?: string
          lastCommitMessage?: string
          lastCommitAuthor?: string
        }
        setLiveStates((prev) => ({
          ...prev,
          [evt.appId]: {
            ...prev[evt.appId],
            deployInProgress: false,
            lastDeployResult: evt.result,
            lastDeployAt: evt.timestamp,
            ...(evt.lastCommitSha
              ? {
                  lastCommitSha: evt.lastCommitSha,
                  lastCommitMessage: evt.lastCommitMessage,
                  lastCommitAuthor: evt.lastCommitAuthor,
                }
              : {}),
          },
        }))
      },
    },
  })

  const mergedApps = initialApps.map((app) => ({
    ...app,
    ...liveStates[app.id],
  }))

  const handleDeploy = useCallback(
    async (id: string) => {
      try {
        await deployApp({ data: id })
        toast('Deploy triggered')
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [toast],
  )

  const handleRestart = useCallback(
    async (id: string) => {
      try {
        await restartApp({ data: id })
        toast('Restart triggered')
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [toast],
  )

  if (mergedApps.length === 0) {
    return (
      <div className="empty-state">
        <h2>No apps yet</h2>
        <p>Register your first app to start managing deployments.</p>
        <Link to="/apps/new" className="btn btn-primary">
          + Add App
        </Link>
      </div>
    )
  }

  return (
    <div className="app-grid">
      {mergedApps.map((app) => (
        <Link
          key={app.id}
          to="/apps/$appId"
          params={{ appId: app.id }}
          className="app-card"
        >
          <div className="app-card-header">
            <h3>{app.name}</h3>
            <StatusBadge
              status={app.status}
              deployLocked={app.deployLocked}
              autoDeployEnabled={app.autoDeployEnabled}
              deployInProgress={app.deployInProgress}
            />
          </div>
          <div className="app-card-meta">
            <div className="meta-row">
              <span>Last deploy</span>
              <span>
                {timeAgo(app.lastDeployAt)}{' '}
                <ResultBadge result={app.lastDeployResult} />
              </span>
            </div>
            <div className="meta-row">
              <span>Commit</span>
              <span>
                {app.lastCommitSha
                  ? `${app.lastCommitSha} ${app.lastCommitMessage || ''}`
                  : '-'}
              </span>
            </div>
            <div className="meta-row">
              <span>Response</span>
              <span>
                {app.responseTimeMs !== null ? `${app.responseTimeMs}ms` : '-'}
              </span>
            </div>
          </div>
          <div
            className="app-card-actions"
            onClick={(e) => e.preventDefault()}
          >
            <button
              className="btn btn-sm"
              onClick={(e) => {
                e.preventDefault()
                handleDeploy(app.id)
              }}
            >
              Redeploy
            </button>
            <button
              className="btn btn-sm"
              onClick={(e) => {
                e.preventDefault()
                handleRestart(app.id)
              }}
            >
              Restart
            </button>
            <Link
              to="/apps/$appId"
              params={{ appId: app.id }}
              className="btn btn-sm"
              onClick={(e) => e.stopPropagation()}
            >
              Details
            </Link>
          </div>
        </Link>
      ))}
    </div>
  )
}
