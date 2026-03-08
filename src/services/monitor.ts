import { getState, updateState } from './state'
import eventBus from './eventBus'
import type { App } from './registry'

const HEALTH_TIMEOUT = 5000

const monitorKey = '__harbormaster_monitors__'
if (!(globalThis as Record<string, unknown>)[monitorKey]) {
  ;(globalThis as Record<string, unknown>)[monitorKey] = new Map<
    string,
    ReturnType<typeof setInterval>
  >()
}
const monitors = (globalThis as Record<string, unknown>)[monitorKey] as Map<
  string,
  ReturnType<typeof setInterval>
>

const uptimeKey = '__harbormaster_uptime__'
if (!(globalThis as Record<string, unknown>)[uptimeKey]) {
  ;(globalThis as Record<string, unknown>)[uptimeKey] = new Map<
    string,
    Array<{ timestamp: number; up: boolean }>
  >()
}
const uptimeHistory = (globalThis as Record<string, unknown>)[
  uptimeKey
] as Map<string, Array<{ timestamp: number; up: boolean }>>

const UPTIME_WINDOW = 24 * 60 * 60 * 1000

export function startMonitoring(app: App): void {
  stopMonitoring(app.id)

  if (!app.healthCheckUrl) return

  const intervalMs = (app.healthCheckInterval || 30) * 1000

  async function check() {
    const prevState = getState(app.id)
    let status: string
    let responseTimeMs: number | null

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT)

      const start = Date.now()
      const res = await fetch(app.healthCheckUrl, {
        signal: controller.signal,
      })
      clearTimeout(timeout)
      responseTimeMs = Date.now() - start

      status = res.ok ? 'up' : 'degraded'
    } catch {
      status = 'down'
      responseTimeMs = null
    }

    if (prevState.deployInProgress) {
      status = 'deploying'
    }

    const history = [...(prevState.responseHistory || [])]
    if (responseTimeMs !== null) {
      history.push(responseTimeMs)
      if (history.length > 10) history.shift()
    }

    if (!uptimeHistory.has(app.id)) uptimeHistory.set(app.id, [])
    const uptimeChecks = uptimeHistory.get(app.id)!
    const now = Date.now()
    uptimeChecks.push({ timestamp: now, up: status === 'up' })

    const cutoff = now - UPTIME_WINDOW
    while (uptimeChecks.length > 0 && uptimeChecks[0].timestamp < cutoff) {
      uptimeChecks.shift()
    }

    const upCount = uptimeChecks.filter((c) => c.up).length
    const uptimePercent24h =
      uptimeChecks.length > 0
        ? Math.round((upCount / uptimeChecks.length) * 1000) / 10
        : null

    updateState(app.id, {
      status,
      responseTimeMs,
      lastChecked: new Date().toISOString(),
      responseHistory: history,
      uptimePercent24h,
    })

    if (prevState.status !== status && prevState.status !== 'unknown') {
      eventBus.emit('event', {
        type: 'status-change',
        appId: app.id,
        from: prevState.status,
        to: status,
        timestamp: new Date().toISOString(),
      })
    }
  }

  check()
  const timer = setInterval(check, intervalMs)
  monitors.set(app.id, timer)
}

export function stopMonitoring(appId: string): void {
  const timer = monitors.get(appId)
  if (timer) {
    clearInterval(timer)
    monitors.delete(appId)
  }
}

export function restartMonitoring(app: App): void {
  startMonitoring(app)
}
