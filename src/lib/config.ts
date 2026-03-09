export function getWebhookBaseUrl(): string {
  return (process.env.WEBHOOK_BASE_URL || 'http://localhost:9000').replace(
    /\/$/,
    '',
  )
}

export function getAppsFile(): string {
  return process.env.APPS_FILE || '/data/apps.json'
}

export function getHooksFile(): string {
  return process.env.HOOKS_FILE || '/data/hooks.json'
}

export function getDeployScript(): string {
  return process.env.DEPLOY_SCRIPT || '/data/deploy.sh'
}

export function getWebhookRelayScript(): string {
  return process.env.WEBHOOK_RELAY_SCRIPT || '/data/webhook-relay.sh'
}

export function getInternalUrl(): string {
  return process.env.INTERNAL_URL || `http://localhost:${getPort()}`
}

export function getLogDir(): string {
  return process.env.LOG_DIR || '/data/logs'
}

export function getAuthToken(): string {
  return process.env.AUTH_TOKEN || ''
}

export function getPort(): number {
  return parseInt(process.env.PORT || '8585', 10)
}
