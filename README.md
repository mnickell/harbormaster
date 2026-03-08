# Harbormaster

A deploy manager for Unraid servers. Harbormaster wraps the [adnanh/webhook](https://github.com/adnanh/webhook) binary to give you a dashboard for managing GitHub webhook deployments, health monitoring, and app lifecycle from a single UI.

Register apps, point them at a repo, and Harbormaster generates the webhook endpoint + secret, writes the hook config, and manages the full deploy pipeline. When GitHub sends a push event, it pulls the latest code and runs `docker compose up -d` in your app's compose directory.

## Features

- **Webhook management** — auto-generates `hooks.json` entries for the webhook binary, handles secret hashing and validation
- **Deploy orchestration** — queued deploys with git pull + docker compose, per-app locking, branch deploys, manual redeploy
- **Health monitoring** — configurable HTTP health checks with status tracking, response time sparklines, 24h uptime percentage
- **Live updates** — SSE-powered real-time status changes, deploy progress streaming, live log output
- **Port management** — parses `docker-compose.yml` to discover ports, detects conflicts across apps, auto-assigns available ports, writes `docker-compose.override.yml` for remapping
- **Container control** — restart containers via Docker socket API
- **Config export** — download a ZIP backup of apps.json + hooks.json
- **Auth** — optional token-based authentication with timing-safe comparison

## Stack

- [TanStack Start](https://tanstack.com/start) — full-stack React framework (Vite + Nitro)
- [TanStack Router](https://tanstack.com/router) — file-based routing with type-safe params
- Plain CSS — custom dark theme design system, no Tailwind
- [adnanh/webhook](https://github.com/adnanh/webhook) — webhook receiver binary (sidecar container)

## Architecture

```
src/
  routes/          File-based pages (index, app detail, add/edit, ports, settings)
  components/      Reusable UI (StatusBadge, Sparkline, LogViewer, Modal, PortTable)
  hooks/           React hooks (useSSE, useAuth, useToast)
  lib/             Server functions, SSE handler, config, auth
  services/        Backend logic (deployer, monitor, registry, portManager, etc.)
  styles/          Global CSS
```

Server functions (`src/lib/server-fns.ts`) use TanStack Start's `createServerFn` for type-safe RPC between client and server. SSE endpoints and the config export route are handled by a custom server entry (`src/entry-server.tsx`) that intercepts `/api/*` paths before TanStack Start processes the request.

All runtime state (health status, deploy progress, port registry) uses `globalThis`-keyed singletons to survive Vite HMR reloads during development.

## Running on Unraid

The intended deployment is as two containers via `docker-compose.yml`:

1. **webhook** — `almir/webhook` listening on port 9000, hot-reloads `hooks.json`
2. **harbormaster** — dashboard UI on port 8585, manages everything else

### Docker Compose

```yaml
version: "3.8"

services:
  webhook:
    image: almir/webhook
    restart: unless-stopped
    ports:
      - "9000:9000"
    volumes:
      - /mnt/user/appdata/harbormaster:/etc/webhook
    command: -hooks /etc/webhook/hooks.json -verbose -hotreload

  harbormaster:
    build: .
    restart: unless-stopped
    ports:
      - "8585:8585"
    volumes:
      - /mnt/user/appdata/harbormaster:/data
      - /var/run/docker.sock:/var/run/docker.sock
      - /proc:/proc:ro
    pid: "host"
    environment:
      - TZ=America/Chicago
      - AUTH_TOKEN=
      - WEBHOOK_BASE_URL=https://deploy.example.com
```

### Unraid Community Applications

An XML template is included at `template.xml` for CA.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WEBHOOK_BASE_URL` | `http://localhost:9000` | Public URL of the webhook receiver (shown when creating apps) |
| `AUTH_TOKEN` | *(empty)* | Optional password to protect the dashboard |
| `APPS_FILE` | `/data/apps.json` | Path to the app registry file |
| `HOOKS_FILE` | `/data/hooks.json` | Path to the webhook hooks config |
| `DEPLOY_SCRIPT` | `/data/deploy.sh` | Path to the generated deploy script |
| `LOG_DIR` | `/data/logs` | Directory for deploy log files |
| `PORT` | `8585` | Dashboard server port |
| `TZ` | — | Timezone for log timestamps |

## Local Development

```bash
# Install dependencies
npm install

# Create local data directory
mkdir -p data/logs

# Start dev server with local paths
APPS_FILE=./data/apps.json \
HOOKS_FILE=./data/hooks.json \
LOG_DIR=./data/logs \
DEPLOY_SCRIPT=./data/deploy.sh \
WEBHOOK_BASE_URL=http://localhost:9000 \
npm run dev
```

Open [http://localhost:8585](http://localhost:8585). Vite provides HMR so changes to components and styles reload instantly.

> Deploy and health-check features won't fully work locally since they depend on Docker and `nsenter` to reach the host. The dashboard UI and app management (CRUD, port management, settings) all work fine.

## Building

```bash
npm run build
node dist/server/server.js
```

The build outputs a self-contained server to `dist/` via Nitro.

## How It Works

1. **Register an app** — give it a name, repo URL, branch, and compose directory. Harbormaster generates a webhook secret and writes a hook entry to `hooks.json`.
2. **Configure GitHub** — add the webhook URL and secret to your repo's Settings > Webhooks.
3. **Push code** — GitHub sends a POST to the webhook receiver, which validates the secret and calls the deploy script.
4. **Deploy runs** — the deploy script uses `nsenter` to break out of the container to the host, runs `git pull` in the compose directory, then `docker compose up -d`.
5. **Monitor** — Harbormaster polls your app's health check URL and tracks status, response times, and uptime.

## License

MIT
