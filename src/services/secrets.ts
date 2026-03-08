import { randomBytes, createHash } from 'crypto'

export function generateSecret(): string {
  return randomBytes(32).toString('hex')
}

export function hashSecret(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}
