import { defineEventHandler, setResponseHeaders, getRouterParam } from 'h3'
import { ensureInitialized } from '../../../../src/services/startup'
import { getApp } from '../../../../src/services/registry'
import { streamCurrentLog } from '../../../../src/services/logStore'
import eventBus from '../../../../src/services/eventBus'

export default defineEventHandler(async (event) => {
  await ensureInitialized()

  const appId = getRouterParam(event, 'id')!
  const app = await getApp(appId)
  if (!app) {
    return Response.json({ error: 'App not found' }, { status: 404 })
  }

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

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

      event.node.req.on('close', () => {
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
      'Connection': 'keep-alive',
    },
  })
})
