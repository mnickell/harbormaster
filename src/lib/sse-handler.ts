import { ensureInitialized } from '~/services/startup'
import { getAllStates } from '~/services/state'
import eventBus from '~/services/eventBus'
import { streamCurrentLog } from '~/services/logStore'
import { getApp } from '~/services/registry'
import { validateAuth, unauthorizedResponse } from '~/lib/auth'
import archiver from 'archiver'
import fs from 'fs/promises'
import { getAppsFile, getHooksFile } from '~/lib/config'

export async function handleAPIRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url)
  const pathname = url.pathname

  if (pathname === '/api/events') return handleEvents(request)
  if (pathname === '/api/export') return handleExport(request)

  // /api/apps/:id/logs
  const logMatch = pathname.match(/^\/api\/apps\/([^/]+)\/logs$/)
  if (logMatch) return handleDeployLogStream(request, logMatch[1])

  return null
}

async function handleEvents(request: Request): Promise<Response> {
  if (!validateAuth(request)) return unauthorizedResponse()
  await ensureInitialized()

  const states = getAllStates()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: initial-state\ndata: ${JSON.stringify(states)}\n\n`,
        ),
      )

      function onEvent(evt: Record<string, unknown>) {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`,
            ),
          )
        } catch {}
      }

      eventBus.on('event', onEvent)

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {}
      }, 30000)

      request.signal.addEventListener('abort', () => {
        eventBus.off('event', onEvent)
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

async function handleDeployLogStream(
  request: Request,
  appId: string,
): Promise<Response> {
  if (!validateAuth(request)) return unauthorizedResponse()
  await ensureInitialized()

  const app = await getApp(appId)
  if (!app) {
    return Response.json({ error: 'App not found' }, { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const cleanup = streamCurrentLog(appId, (data) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          )
        } catch {}
      })

      function onEvent(evt: Record<string, unknown>) {
        if (evt.type === 'deploy-log-line' && evt.appId === appId) {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(evt.data)}\n\n`),
            )
          } catch {}
        }
        if (evt.type === 'deploy-complete' && evt.appId === appId) {
          try {
            controller.enqueue(
              encoder.encode(
                `event: deploy-complete\ndata: ${JSON.stringify(evt)}\n\n`,
              ),
            )
          } catch {}
        }
      }

      eventBus.on('event', onEvent)

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {}
      }, 30000)

      request.signal.addEventListener('abort', () => {
        cleanup()
        eventBus.off('event', onEvent)
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

async function handleExport(request: Request): Promise<Response> {
  if (!validateAuth(request)) return unauthorizedResponse()
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

  // Wait for all data events
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
}
