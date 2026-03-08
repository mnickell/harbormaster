import { useRef, useEffect } from 'react'

interface LogViewerProps {
  content: string
  live?: boolean
}

export function LogViewer({ content, live }: LogViewerProps) {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (live && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [content, live])

  return (
    <pre ref={ref} className={`log-viewer ${live ? 'live' : ''}`}>
      {content || 'No output'}
    </pre>
  )
}
