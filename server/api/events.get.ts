import { defineEventHandler, setResponseHeaders } from 'h3'
import { ensureInitialized } from '../../src/services/startup'
import { getAllStates } from '../../src/services/state'
import eventBus from '../../src/services/eventBus'

export default defineEventHandler(async (event) => {
  console.log('[api/events] SSE request received', event.node.req.url)
  await ensureInitialized()

  const states = getAllStates()

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

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

      event.node.req.on('close', () => {
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
