import fs from 'fs/promises'
import path from 'path'
import { getLogDir } from '~/lib/config'

const MAX_LINES = 500

function logDir(appId: string): string {
  return path.join(getLogDir(), appId)
}

function currentLogPath(appId: string): string {
  return path.join(logDir(appId), 'current.log')
}

function deployLogPath(appId: string): string {
  return path.join(logDir(appId), 'deploy.log')
}

export async function ensureLogDir(appId: string): Promise<void> {
  await fs.mkdir(logDir(appId), { recursive: true })
}

export async function writeCurrentLog(
  appId: string,
  content: string,
): Promise<void> {
  await ensureLogDir(appId)
  await fs.writeFile(currentLogPath(appId), content)
}

export async function appendCurrentLog(
  appId: string,
  line: string,
): Promise<void> {
  await ensureLogDir(appId)
  await fs.appendFile(currentLogPath(appId), line)
}

export async function readCurrentLog(appId: string): Promise<string> {
  try {
    return await fs.readFile(currentLogPath(appId), 'utf8')
  } catch {
    return ''
  }
}

export async function appendDeployLog(
  appId: string,
  output: string,
  result: string,
  durationSec: number,
): Promise<void> {
  await ensureLogDir(appId)
  const timestamp = new Date().toISOString()
  const header = `===== DEPLOY ${timestamp} | result: ${result} | duration: ${durationSec}s =====\n`
  const block = header + output + '\n\n'

  let existing = ''
  try {
    existing = await fs.readFile(deployLogPath(appId), 'utf8')
  } catch {}

  const combined = block + existing
  const lines = combined.split('\n')
  const trimmed =
    lines.length > MAX_LINES ? lines.slice(0, MAX_LINES).join('\n') : combined

  await fs.writeFile(deployLogPath(appId), trimmed)
}

export interface DeployHistoryEntry {
  deployId: string
  timestamp: string
  result: string
  duration: string
}

export async function listDeployHistory(
  appId: string,
): Promise<DeployHistoryEntry[]> {
  let content: string
  try {
    content = await fs.readFile(deployLogPath(appId), 'utf8')
  } catch {
    return []
  }

  const headerRegex =
    /^===== DEPLOY (.+?) \| result: (.+?) \| duration: (.+?) =====$/gm
  const deploys: DeployHistoryEntry[] = []
  let match: RegExpExecArray | null

  while ((match = headerRegex.exec(content)) !== null) {
    deploys.push({
      deployId: match[1],
      timestamp: match[1],
      result: match[2],
      duration: match[3],
    })
  }

  return deploys
}

export async function getDeployLog(
  appId: string,
  deployId: string,
): Promise<string | null> {
  let content: string
  try {
    content = await fs.readFile(deployLogPath(appId), 'utf8')
  } catch {
    return null
  }

  const startMarker = `===== DEPLOY ${deployId}`
  const startIdx = content.indexOf(startMarker)
  if (startIdx === -1) return null

  const afterHeader = content.indexOf('\n', startIdx)
  if (afterHeader === -1) return ''

  const nextDeploy = content.indexOf('===== DEPLOY ', afterHeader + 1)
  const endIdx = nextDeploy === -1 ? content.length : nextDeploy

  return content.slice(afterHeader + 1, endIdx).trim()
}

export function streamCurrentLog(
  appId: string,
  onData: (data: string) => void,
): () => void {
  const filePath = currentLogPath(appId)
  let position = 0
  let closed = false

  async function readNew() {
    if (closed) return
    try {
      const stat = await fs.stat(filePath)
      if (stat.size > position) {
        const content = await fs.readFile(filePath, 'utf8')
        const newContent = content.slice(position)
        if (newContent) onData(newContent)
        position = stat.size
      }
    } catch {}
  }

  const interval = setInterval(readNew, 500)
  readNew()

  return () => {
    closed = true
    clearInterval(interval)
  }
}
