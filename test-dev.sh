#!/bin/bash
export APPS_FILE=./data/apps.json
export HOOKS_FILE=./data/hooks.json
export LOG_DIR=./data/logs
export DEPLOY_SCRIPT=./data/deploy.sh
export WEBHOOK_BASE_URL=http://localhost:9000

npx vite dev --port 8585 > /tmp/vite-harbormaster.log 2>&1 &
VPID=$!
sleep 8
curl -s http://localhost:8585/ > /dev/null 2>&1
sleep 2
cat /tmp/vite-harbormaster.log
kill $VPID 2>/dev/null
