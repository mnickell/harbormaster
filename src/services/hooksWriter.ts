import fs from 'fs/promises'
import path from 'path'
import { getHooksFile, getDeployScript } from '~/lib/config'
import type { App } from './registry'

interface HookEntry {
  id: string
  'execute-command': string
  'pass-arguments-to-command': Array<{ source: string; name: string }>
  'trigger-rule': {
    match: {
      type: string
      secret: string
      parameter: { source: string; name: string }
    }
  }
}

export async function loadHooks(): Promise<HookEntry[]> {
  try {
    const data = await fs.readFile(getHooksFile(), 'utf8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function saveHooks(hooks: HookEntry[]): Promise<void> {
  const hooksFile = getHooksFile()
  await fs.mkdir(path.dirname(hooksFile), { recursive: true })
  const tmp = hooksFile + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(hooks, null, 2))
  await fs.rename(tmp, hooksFile)
}

function buildHookEntry(app: App, rawSecret: string): HookEntry {
  return {
    id: `deploy-${app.id}`,
    'execute-command': getDeployScript(),
    'pass-arguments-to-command': [
      { source: 'string', name: app.id },
      { source: 'string', name: app.repo },
    ],
    'trigger-rule': {
      match: {
        type: 'payload-hmac-sha256',
        secret: rawSecret,
        parameter: {
          source: 'header',
          name: 'X-Hub-Signature-256',
        },
      },
    },
  }
}

export async function syncHook(app: App, rawSecret: string): Promise<void> {
  const hooks = await loadHooks()
  const hookId = `deploy-${app.id}`
  const idx = hooks.findIndex((h) => h.id === hookId)
  const entry = buildHookEntry(app, rawSecret)

  if (idx === -1) {
    hooks.push(entry)
  } else {
    hooks[idx] = entry
  }

  await saveHooks(hooks)
}

export async function updateHookSecret(
  appId: string,
  rawSecret: string,
): Promise<void> {
  const hooks = await loadHooks()
  const hookId = `deploy-${appId}`
  const idx = hooks.findIndex((h) => h.id === hookId)
  if (idx === -1) throw new Error(`Hook for "${appId}" not found`)

  hooks[idx]['trigger-rule'].match.secret = rawSecret
  await saveHooks(hooks)
}

export async function updateHookRepo(app: App): Promise<void> {
  const hooks = await loadHooks()
  const hookId = `deploy-${app.id}`
  const idx = hooks.findIndex((h) => h.id === hookId)
  if (idx === -1) return

  hooks[idx]['pass-arguments-to-command'] = [
    { source: 'string', name: app.id },
    { source: 'string', name: app.repo },
  ]
  await saveHooks(hooks)
}

export async function removeHook(appId: string): Promise<void> {
  const hooks = await loadHooks()
  const hookId = `deploy-${appId}`
  const filtered = hooks.filter((h) => h.id !== hookId)
  await saveHooks(filtered)
}
