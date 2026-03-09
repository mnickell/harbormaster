import fs from 'fs/promises'
import path from 'path'
import { getDeployScript, getWebhookRelayScript, getPort } from '~/lib/config'
import { loadApps, addApp } from './registry'
import { loadHooks, migrateHooksToRelay } from './hooksWriter'
import { hashSecret } from './secrets'
import { startMonitoring } from './monitor'
import { startPortScanning } from './portManager'
import { updateState } from './state'
import { listDeployHistory } from './logStore'

const key = '__harbormaster_initialized__'

export async function ensureInitialized(): Promise<void> {
  if ((globalThis as Record<string, unknown>)[key]) return
  ;(globalThis as Record<string, unknown>)[key] = true

  console.log('Harbormaster initializing...')

  // Always write deploy.sh (overwrite to pick up changes)
  const deployScript = getDeployScript()
  {
    const script = `#!/bin/sh

APP_NAME=$1
REPO_URL=$2
BRANCH=\${3:-main}

nsenter -t 1 -m -u -i -n /bin/bash <<EOF
set -e
APP_DIR="/mnt/user/appdata/\$APP_NAME"

echo "Deploying \$APP_NAME at \\$(date)"

if [ ! -d "\\$APP_DIR/.git" ]; then
  echo "No repo found, cloning..."
  mkdir -p \\$APP_DIR
  git clone \$REPO_URL \\$APP_DIR
else
  echo "Repo found, pulling latest..."
  cd \\$APP_DIR
  git pull origin \$BRANCH
fi

cd \\$APP_DIR
docker compose build
docker compose up -d --remove-orphans

# Output commit info for Harbormaster to parse
COMMIT_INFO=\\$(git log -1 --format="%h|%s|%an" 2>/dev/null || echo "")
if [ -n "\\$COMMIT_INFO" ]; then
  echo "HARBORMASTER_COMMIT:\\$COMMIT_INFO"
fi

echo "\\$APP_NAME deploy complete"
EOF
`
    try {
      await fs.mkdir(path.dirname(deployScript), { recursive: true })
      await fs.writeFile(deployScript, script, { mode: 0o755 })
      console.log('Wrote deploy.sh')
    } catch (err) {
      console.log(
        'Could not write deploy.sh (may not be needed in dev):',
        (err as Error).message,
      )
    }
  }

  // Always write webhook-relay.sh (runs in webhook container, relays to Harbormaster API)
  const relayScript = getWebhookRelayScript()
  {
    const port = getPort()
    const script = `#!/bin/sh
# Called by the webhook binary. Relays deploy to Harbormaster's API
# so deploys are properly tracked. Uses wget (built into Alpine).
# Reaches Harbormaster via Docker Compose service name.

APP_ID="$1"

wget -q -O- --post-data='{}' --header='Content-Type: application/json' \\
  "http://harbormaster:${port}/api/apps/$APP_ID/deploy" 2>&1 \\
  || echo "Failed to relay deploy to Harbormaster"
`
    try {
      await fs.mkdir(path.dirname(relayScript), { recursive: true })
      await fs.writeFile(relayScript, script, { mode: 0o755 })
      console.log('Wrote webhook-relay.sh')
    } catch (err) {
      console.log(
        'Could not write webhook-relay.sh (may not be needed in dev):',
        (err as Error).message,
      )
    }
  }

  // Migration: import existing hooks.json entries
  try {
    const apps = await loadApps()
    if (apps.length === 0) {
      const hooks = await loadHooks()
      if (hooks.length > 0) {
        console.log(`Found ${hooks.length} existing hooks, importing...`)
        for (const hook of hooks) {
          const match = hook.id.match(/^deploy-(.+)$/)
          if (!match) continue

          const appId = match[1]
          const args = hook['pass-arguments-to-command'] || []
          const repo = args[1]?.name || ''
          const rawSecret = hook['trigger-rule']?.match?.secret || ''

          await addApp({
            id: appId,
            name: appId
              .replace(/-/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            repo,
            branch: 'main',
            composeDir: `/mnt/user/appdata/${appId}`,
            healthCheckUrl: '',
            healthCheckInterval: 30,
            webhookSecretHash: rawSecret ? hashSecret(rawSecret) : '',
            autoDeployEnabled: true,
            deployLocked: false,
            ports: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          console.log(`  Imported: ${appId}`)
        }
      }
    }
  } catch (err) {
    console.log('Migration check skipped:', (err as Error).message)
  }

  // Migrate existing hooks to use webhook-relay.sh
  try {
    const migrated = await migrateHooksToRelay()
    if (migrated > 0) {
      console.log(`Migrated ${migrated} hooks to use webhook-relay.sh`)
    }
  } catch {}

  // Restore deploy state from disk logs
  try {
    const apps = await loadApps()
    for (const app of apps) {
      const history = await listDeployHistory(app.id)
      if (history.length > 0) {
        const latest = history[0]
        updateState(app.id, {
          lastDeployAt: latest.timestamp,
          lastDeployResult: latest.result,
        })
        console.log(`  Restored deploy state for ${app.id}: ${latest.result} at ${latest.timestamp}`)
      }
    }
  } catch {}

  // Start port scanning
  startPortScanning()
  console.log('Port scanning active')

  // Start health monitoring
  try {
    const apps = await loadApps()
    for (const a of apps) {
      startMonitoring(a)
    }
    console.log(`Monitoring ${apps.length} apps`)
  } catch {}

  console.log('Harbormaster initialized')
}
