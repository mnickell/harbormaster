import { spawn } from 'child_process'
import { getState, updateState } from './state'
import {
  appendDeployLog,
  ensureLogDir,
  writeCurrentLog,
  appendCurrentLog,
} from './logStore'
import { getApp } from './registry'
import eventBus from './eventBus'
import { getDeployScript } from '~/lib/config'

interface DeployOptions {
  manual?: boolean
  branch?: string
}

interface DeployResult {
  started?: boolean
  queued?: boolean
  skipped?: boolean
  reason?: string
  result?: string
  duration?: number
}

const key = '__harbormaster_deployQueues__'
if (!(globalThis as Record<string, unknown>)[key]) {
  ;(globalThis as Record<string, unknown>)[key] = new Map<
    string,
    DeployOptions[]
  >()
}
const deployQueues = (globalThis as Record<string, unknown>)[key] as Map<
  string,
  DeployOptions[]
>

export async function triggerDeploy(
  appId: string,
  options: DeployOptions = {},
): Promise<DeployResult> {
  const app = await getApp(appId)
  if (!app) throw new Error(`App "${appId}" not found`)

  if (app.deployLocked) {
    throw new Error(`App "${appId}" is deploy-locked`)
  }

  if (!options.manual && !app.autoDeployEnabled) {
    return { skipped: true, reason: 'Auto-deploy disabled' }
  }

  const state = getState(appId)
  if (state.deployInProgress) {
    if (!deployQueues.has(appId)) deployQueues.set(appId, [])
    deployQueues.get(appId)!.push(options)
    updateState(appId, { deployQueue: deployQueues.get(appId)!.length })
    return { queued: true }
  }

  await executeDeploy(appId, options)
  return { started: true }
}

async function executeDeploy(
  appId: string,
  options: DeployOptions,
): Promise<void> {
  const app = await getApp(appId)
  if (!app) return

  const branch = options.branch || app.branch || 'main'

  updateState(appId, {
    deployInProgress: true,
    status: 'deploying',
    deployQueue: (deployQueues.get(appId) || []).length,
  })

  eventBus.emit('event', {
    type: 'deploy-start',
    appId,
    timestamp: new Date().toISOString(),
  })

  await ensureLogDir(appId)
  await writeCurrentLog(appId, '')

  const startTime = Date.now()
  let output = ''

  const proc = spawn(getDeployScript(), [appId, app.repo, branch], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  function handleData(data: Buffer) {
    const text = data.toString()
    output += text
    appendCurrentLog(appId, text).catch(() => {})
    eventBus.emit('event', {
      type: 'deploy-log-line',
      appId,
      data: text,
    })
  }

  proc.stdout.on('data', handleData)
  proc.stderr.on('data', handleData)

  proc.on('close', async (code) => {
    const durationSec = Math.round((Date.now() - startTime) / 1000)
    const result = code === 0 ? 'success' : 'failed'

    await appendDeployLog(appId, output, result, durationSec)

    // Parse commit info from deploy script output (HARBORMASTER_COMMIT marker)
    let commitInfo: Record<string, string> = {}
    const commitMatch = output.match(
      /HARBORMASTER_COMMIT:([^|]*)\|([^|]*)\|(.*)$/m,
    )
    if (commitMatch) {
      commitInfo = {
        lastCommitSha: commitMatch[1].trim(),
        lastCommitMessage: commitMatch[2].trim(),
        lastCommitAuthor: commitMatch[3].trim(),
      }
    }

    updateState(appId, {
      deployInProgress: false,
      status: result === 'success' ? 'up' : getState(appId).status,
      lastDeployAt: new Date().toISOString(),
      lastDeployResult: result,
      deployQueue: 0,
      ...commitInfo,
    })

    eventBus.emit('event', {
      type: 'deploy-complete',
      appId,
      result,
      duration: durationSec,
      timestamp: new Date().toISOString(),
      ...commitInfo,
    })

    // Process queue
    const queue = deployQueues.get(appId)
    if (queue && queue.length > 0) {
      const next = queue.shift()!
      if (queue.length === 0) deployQueues.delete(appId)
      executeDeploy(appId, next)
    }
  })

  proc.on('error', async (err) => {
    const durationSec = Math.round((Date.now() - startTime) / 1000)
    output += `\nError: ${err.message}\n`
    await appendDeployLog(appId, output, 'failed', durationSec)

    updateState(appId, {
      deployInProgress: false,
      lastDeployAt: new Date().toISOString(),
      lastDeployResult: 'failed',
      deployQueue: 0,
    })

    eventBus.emit('event', {
      type: 'deploy-complete',
      appId,
      result: 'failed',
      duration: durationSec,
      timestamp: new Date().toISOString(),
    })
  })
}
