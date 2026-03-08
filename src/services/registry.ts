import fs from 'fs/promises'
import path from 'path'
import { getAppsFile } from '~/lib/config'

export interface PortMapping {
  containerPort: number
  hostPort: number
  protocol: string
  service?: string
  overridden: boolean
}

export interface App {
  id: string
  name: string
  repo: string
  branch: string
  composeDir: string
  healthCheckUrl: string
  healthCheckInterval: number
  webhookSecretHash: string
  autoDeployEnabled: boolean
  deployLocked: boolean
  ports: PortMapping[]
  createdAt: string
  updatedAt: string
}

async function ensureFile(): Promise<void> {
  const appsFile = getAppsFile()
  try {
    await fs.access(appsFile)
  } catch {
    await fs.mkdir(path.dirname(appsFile), { recursive: true })
    await fs.writeFile(appsFile, '[]')
  }
}

export async function loadApps(): Promise<App[]> {
  await ensureFile()
  const data = await fs.readFile(getAppsFile(), 'utf8')
  return JSON.parse(data)
}

export async function saveApps(apps: App[]): Promise<void> {
  const appsFile = getAppsFile()
  const tmp = appsFile + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(apps, null, 2))
  await fs.rename(tmp, appsFile)
}

export async function getApp(id: string): Promise<App | null> {
  const apps = await loadApps()
  return apps.find((a) => a.id === id) || null
}

export async function addApp(app: App): Promise<App> {
  const apps = await loadApps()
  if (apps.find((a) => a.id === app.id)) {
    throw new Error(`App with id "${app.id}" already exists`)
  }
  apps.push(app)
  await saveApps(apps)
  return app
}

export async function updateApp(
  id: string,
  fields: Partial<App>,
): Promise<App> {
  const apps = await loadApps()
  const idx = apps.findIndex((a) => a.id === id)
  if (idx === -1) throw new Error(`App "${id}" not found`)
  apps[idx] = { ...apps[idx], ...fields, updatedAt: new Date().toISOString() }
  await saveApps(apps)
  return apps[idx]
}

export async function removeApp(id: string): Promise<App> {
  const apps = await loadApps()
  const idx = apps.findIndex((a) => a.id === id)
  if (idx === -1) throw new Error(`App "${id}" not found`)
  const [removed] = apps.splice(idx, 1)
  await saveApps(apps)
  return removed
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
