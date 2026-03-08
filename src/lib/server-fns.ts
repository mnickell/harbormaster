import { createServerFn } from '@tanstack/react-start'
import { ensureInitialized } from '~/services/startup'
import { loadApps, getApp, addApp, updateApp, removeApp, slugify } from '~/services/registry'
import type { App } from '~/services/registry'
import { generateSecret, hashSecret } from '~/services/secrets'
import { syncHook, updateHookRepo, updateHookSecret, removeHook, loadHooks } from '~/services/hooksWriter'
import { getState, removeState, getAllStates } from '~/services/state'
import { startMonitoring, stopMonitoring } from '~/services/monitor'
import { triggerDeploy } from '~/services/deployer'
import { restartContainer } from '~/services/dockerClient'
import { listDeployHistory, getDeployLog } from '~/services/logStore'
import {
  getPortMap, getAvailablePorts, parseComposePorts, resolvePorts,
  registerAppPorts, unregisterAppPorts, writeOverrideFile, deleteOverrideFile,
  scanExternalPorts,
} from '~/services/portManager'
import { getWebhookBaseUrl } from '~/lib/config'

// ---------- Apps ----------

export const fetchApps = createServerFn({ method: 'GET' }).handler(async () => {
  await ensureInitialized()
  const apps = await loadApps()
  return apps.map((app) => ({ ...app, ...getState(app.id) }))
})

export const fetchApp = createServerFn({ method: 'GET' })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    await ensureInitialized()
    const app = await getApp(id)
    if (!app) throw new Error('App not found')
    return { ...app, ...getState(app.id) }
  })

interface CreateAppInput {
  name: string
  repo: string
  branch?: string
  composeDir?: string
  healthCheckUrl?: string
  healthCheckInterval?: number
  autoDeployEnabled?: boolean
}

export const createApp = createServerFn({ method: 'POST' })
  .inputValidator((input: CreateAppInput) => input)
  .handler(async ({ data }) => {
    await ensureInitialized()
    const id = slugify(data.name)
    const rawSecret = generateSecret()
    const now = new Date().toISOString()
    const resolvedComposeDir = data.composeDir || `/mnt/user/appdata/${id}`

    let ports: App['ports'] = []
    let portConflicts: Array<{ reason: string }> = []
    try {
      const composePorts = await parseComposePorts(resolvedComposeDir)
      if (composePorts.length > 0) {
        const resolved = resolvePorts(composePorts, id)
        ports = resolved.ports
        portConflicts = resolved.conflicts
      }
    } catch {}

    const app: App = {
      id,
      name: data.name,
      repo: data.repo,
      branch: data.branch || 'main',
      composeDir: resolvedComposeDir,
      healthCheckUrl: data.healthCheckUrl || '',
      healthCheckInterval: data.healthCheckInterval || 30,
      webhookSecretHash: hashSecret(rawSecret),
      autoDeployEnabled: data.autoDeployEnabled !== false,
      deployLocked: false,
      ports,
      createdAt: now,
      updatedAt: now,
    }

    await addApp(app)
    await syncHook(app, rawSecret)
    registerAppPorts(id, ports)

    let overrideResult = {}
    if (ports.some((p) => p.overridden)) {
      try {
        overrideResult = await writeOverrideFile(resolvedComposeDir, ports)
      } catch {}
    }

    startMonitoring(app)

    return {
      app,
      webhookSecret: rawSecret,
      webhookUrl: `${getWebhookBaseUrl()}/hooks/deploy-${id}`,
      portConflicts,
      override: overrideResult,
    }
  })

interface UpdateAppInput {
  id: string
  fields: Partial<CreateAppInput>
}

export const updateAppFn = createServerFn({ method: 'POST' })
  .inputValidator((input: UpdateAppInput) => input)
  .handler(async ({ data: { id, fields } }) => {
    await ensureInitialized()
    const app = await updateApp(id, fields)

    if (fields.repo !== undefined) {
      await updateHookRepo(app)
    }

    stopMonitoring(app.id)
    startMonitoring(app)

    return app
  })

export const deleteApp = createServerFn({ method: 'POST' })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    await ensureInitialized()
    const removed = await removeApp(id)
    await removeHook(id)
    stopMonitoring(id)
    removeState(id)
    unregisterAppPorts(id)
    return { removed: removed.id }
  })

// ---------- Secrets ----------

export const rotateSecret = createServerFn({ method: 'POST' })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    await ensureInitialized()
    const app = await getApp(id)
    if (!app) throw new Error('App not found')

    const rawSecret = generateSecret()
    await updateApp(id, { webhookSecretHash: hashSecret(rawSecret) })
    await updateHookSecret(id, rawSecret)

    return {
      webhookSecret: rawSecret,
      webhookUrl: `${getWebhookBaseUrl()}/hooks/deploy-${app.id}`,
    }
  })

// ---------- Deploy & Lifecycle ----------

export const deployApp = createServerFn({ method: 'POST' })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    await ensureInitialized()
    return triggerDeploy(id, { manual: true })
  })

interface DeployBranchInput {
  id: string
  branch: string
}

export const deployBranch = createServerFn({ method: 'POST' })
  .inputValidator((input: DeployBranchInput) => input)
  .handler(async ({ data }) => {
    await ensureInitialized()
    return triggerDeploy(data.id, { manual: true, branch: data.branch })
  })

export const restartApp = createServerFn({ method: 'POST' })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    await ensureInitialized()
    const app = await getApp(id)
    if (!app) throw new Error('App not found')
    const success = await restartContainer(app.id)
    if (!success) throw new Error('Failed to restart container')
    return { restarted: true }
  })

export const toggleLock = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: string; locked: boolean }) => input)
  .handler(async ({ data }) => {
    await ensureInitialized()
    return updateApp(data.id, { deployLocked: data.locked })
  })

export const toggleAutoDeploy = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: string; enabled: boolean }) => input)
  .handler(async ({ data }) => {
    await ensureInitialized()
    return updateApp(data.id, { autoDeployEnabled: data.enabled })
  })

// ---------- Logs ----------

export const fetchDeployHistory = createServerFn({ method: 'GET' })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    await ensureInitialized()
    return listDeployHistory(id)
  })

export const fetchDeployLogEntry = createServerFn({ method: 'GET' })
  .inputValidator((input: { appId: string; deployId: string }) => input)
  .handler(async ({ data }) => {
    await ensureInitialized()
    const log = await getDeployLog(data.appId, data.deployId)
    return { deployId: data.deployId, output: log }
  })

// ---------- Status ----------

const startedAt = new Date().toISOString()

export const fetchStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    await ensureInitialized()
    return {
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime(),
      startedAt,
    }
  },
)

export const fetchAllStates = createServerFn({ method: 'GET' }).handler(
  async () => {
    await ensureInitialized()
    return getAllStates()
  },
)

// ---------- Sync ----------

export const syncFromHooks = createServerFn({ method: 'POST' }).handler(
  async () => {
    await ensureInitialized()
    const hooks = await loadHooks()
    const apps = await loadApps()
    const appIds = new Set(apps.map((a) => a.id))
    const imported: string[] = []

    for (const hook of hooks) {
      const match = hook.id.match(/^deploy-(.+)$/)
      if (!match) continue

      const appId = match[1]
      if (appIds.has(appId)) continue

      const args = hook['pass-arguments-to-command'] || []
      const repo = args[1]?.name || ''
      const rawSecret = hook['trigger-rule']?.match?.secret || ''

      await addApp({
        id: appId,
        name: appId
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        repo,
        branch: 'main',
        composeDir: `/mnt/user/appdata/${appId}`,
        healthCheckUrl: '',
        healthCheckInterval: 30,
        webhookSecretHash: rawSecret ? hashSecret(rawSecret) : '',
        autoDeployEnabled: true,
        deployLocked: false,
        ports: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      imported.push(appId)
    }

    return { imported, total: imported.length }
  },
)

// ---------- Ports ----------

export const fetchPortMap = createServerFn({ method: 'GET' }).handler(
  async () => {
    await ensureInitialized()
    await scanExternalPorts()
    return getPortMap()
  },
)

export const fetchAvailablePorts = createServerFn({ method: 'GET' })
  .inputValidator((input: { base: number; count: number }) => input)
  .handler(async ({ data }) => {
    await ensureInitialized()
    return { ports: getAvailablePorts(data.base, data.count) }
  })

export const parseComposePortsFn = createServerFn({ method: 'POST' })
  .inputValidator((composeDir: string) => composeDir)
  .handler(async ({ data: composeDir }) => {
    await ensureInitialized()
    return { ports: await parseComposePorts(composeDir) }
  })

interface UpdatePortsInput {
  id: string
  ports: Array<{
    containerPort: number
    hostPort: number
    protocol?: string
    service?: string
  }>
}

export const updatePorts = createServerFn({ method: 'POST' })
  .inputValidator((input: UpdatePortsInput) => input)
  .handler(async ({ data }) => {
    await ensureInitialized()
    const app = await getApp(data.id)
    if (!app) throw new Error('App not found')

    const composePorts = await parseComposePorts(app.composeDir)
    const composeMap: Record<number, number> = {}
    for (const cp of composePorts) {
      composeMap[cp.containerPort] = cp.hostPort
    }

    const ports = data.ports.map((p) => ({
      containerPort: p.containerPort,
      hostPort: p.hostPort,
      protocol: p.protocol || 'tcp',
      service: p.service,
      overridden: composeMap[p.containerPort] !== p.hostPort,
    }))

    const { ports: resolved, conflicts } = resolvePorts(ports, app.id)
    registerAppPorts(app.id, resolved)
    const updated = await updateApp(app.id, { ports: resolved })
    const overrideResult = await writeOverrideFile(app.composeDir, resolved)

    return { app: updated, ports: resolved, conflicts, override: overrideResult }
  })

export const resetPorts = createServerFn({ method: 'POST' })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    await ensureInitialized()
    const app = await getApp(id)
    if (!app) throw new Error('App not found')

    const composePorts = await parseComposePorts(app.composeDir)
    const { ports: resolved, conflicts } = resolvePorts(composePorts, app.id)

    registerAppPorts(app.id, resolved)
    const updated = await updateApp(app.id, { ports: resolved })

    const overrideResult = resolved.some((p) => p.overridden)
      ? await writeOverrideFile(app.composeDir, resolved)
      : await deleteOverrideFile(app.composeDir)

    return { app: updated, ports: resolved, conflicts, override: overrideResult }
  })
