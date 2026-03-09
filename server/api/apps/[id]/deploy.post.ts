import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { ensureInitialized } from '../../../../src/services/startup'
import { triggerDeploy } from '../../../../src/services/deployer'

export default defineEventHandler(async (event) => {
  await ensureInitialized()

  const appId = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))

  try {
    // Webhook-relayed deploys and manual API calls both go through triggerDeploy.
    // Pass manual: true so autoDeployEnabled checks are skipped — the webhook
    // binary already validated the request via HMAC.
    const result = await triggerDeploy(appId, {
      manual: true,
      branch: body?.branch,
    })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 400 },
    )
  }
})
