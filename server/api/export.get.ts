import { defineEventHandler } from 'h3'
import { ensureInitialized } from '../../src/services/startup'
import archiver from 'archiver'
import fs from 'fs/promises'
import { getAppsFile, getHooksFile } from '../../src/lib/config'

export default defineEventHandler(async () => {
  await ensureInitialized()

  const appsFile = getAppsFile()
  const hooksFile = getHooksFile()

  const chunks: Uint8Array[] = []

  const archive = archiver('zip')
  archive.on('data', (chunk: Buffer) => chunks.push(new Uint8Array(chunk)))

  try {
    const appsData = await fs.readFile(appsFile, 'utf8')
    archive.append(appsData, { name: 'apps.json' })
  } catch {}

  try {
    const hooksData = await fs.readFile(hooksFile, 'utf8')
    archive.append(hooksData, { name: 'hooks.json' })
  } catch {}

  await archive.finalize()
  await new Promise<void>((resolve) => archive.on('end', resolve))

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return new Response(result, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename=harbormaster-export.zip',
    },
  })
})
