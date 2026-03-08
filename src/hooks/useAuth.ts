import { useState, useCallback } from 'react'

const TOKEN_KEY = 'hm_token'

export function useAuth() {
  const [token, setTokenState] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(TOKEN_KEY) || ''
  })

  const setToken = useCallback((t: string) => {
    localStorage.setItem(TOKEN_KEY, t)
    setTokenState(t)
  }, [])

  const clearToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setTokenState('')
  }, [])

  return { token, setToken, clearToken }
}

export function getStoredToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(TOKEN_KEY) || ''
}
