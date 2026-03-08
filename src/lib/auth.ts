import { timingSafeEqual } from 'crypto'
import { getAuthToken } from './config'

export function validateAuth(request: Request): boolean {
  const token = getAuthToken()
  if (!token) return true

  const url = new URL(request.url)
  const provided =
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    url.searchParams.get('token')

  if (!provided) return false

  const a = Buffer.from(token)
  const b = Buffer.from(provided)

  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: 'Authorization required' }, { status: 401 })
}
