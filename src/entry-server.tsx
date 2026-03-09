import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

const handler = createStartHandler(defaultStreamHandler)

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      console.log('[entry-server] API request fell through to TanStack Start:', url.pathname, 'Accept:', request.headers.get('Accept'))
    }
    return handler(request)
  },
}
