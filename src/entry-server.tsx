import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { handleAPIRoute } from '~/lib/sse-handler'

const startHandler = createStartHandler(defaultStreamHandler)

export default {
  async fetch(request: Request): Promise<Response> {
    // Handle raw API routes (SSE, export) before TanStack Start
    const apiResponse = await handleAPIRoute(request)
    if (apiResponse) return apiResponse

    // Fall through to TanStack Start for pages and server functions
    return startHandler(request)
  },
}
