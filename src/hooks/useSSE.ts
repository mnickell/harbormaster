import { useEffect, useRef, useCallback } from 'react'
import { getStoredToken } from './useAuth'

type EventHandler = (data: unknown) => void

interface UseSSEOptions {
  url: string
  events: Record<string, EventHandler>
  enabled?: boolean
}

export function useSSE({ url, events, enabled = true }: UseSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const eventsRef = useRef(events)
  eventsRef.current = events

  const connect = useCallback(() => {
    if (!enabled) return

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const token = getStoredToken()
    const fullUrl = token
      ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
      : url

    const es = new EventSource(fullUrl)

    for (const eventName of Object.keys(eventsRef.current)) {
      es.addEventListener(eventName, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          eventsRef.current[eventName]?.(data)
        } catch {}
      })
    }

    es.onerror = () => {
      es.close()
      setTimeout(connect, 5000)
    }

    eventSourceRef.current = es
  }, [url, enabled])

  useEffect(() => {
    connect()
    return () => {
      eventSourceRef.current?.close()
    }
  }, [connect])
}
