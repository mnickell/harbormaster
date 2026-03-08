import fs from 'fs/promises'
import path from 'path'
import { getDeployScript } from '~/lib/config'
import { loadApps, addApp } from './registry'
import { loadHooks } from './hooksWriter'
import { hashSecret } from './secrets'
import { startMonitoring } from './monitor'
import { startPortScanning } from './portManager'

const key = '__harbormaster_initialized__'

export async function ensureInitialized(): Promise<void> {
  if ((globalThis as Record<string, unknown>)[key]) return
  ;(globalThis as Record<string, unknown>)[key] = true

  console.log('Harbormaster initializing...')

  // Write deploy.sh if missing
  const deployScript = getDeployScript()
  try {
    await fs.access(deployScript)
  } catch {
    console.log('Writing default deploy.sh...')
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

echo "\\$APP_NAME deploy complete"
EOF
`
    try {
      await fs.mkdir(path.dirname(deployScript), { recursive: true })
      await fs.writeFile(deployScript, script, { mode: 0o755 })
    } catch (err) {
      console.log(
        'Could not write deploy.sh (may not be needed in dev):',
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
