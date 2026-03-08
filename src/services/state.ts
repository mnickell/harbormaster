export interface AppState {
  status: string
  responseTimeMs: number | null
  lastChecked: string | null
  responseHistory: number[]
  uptimePercent24h: number | null
  containerState: string | null
  lastDeployAt: string | null
  lastDeployResult: string | null
  lastCommitSha: string | null
  lastCommitMessage: string | null
  lastCommitAuthor: string | null
  deployInProgress: boolean
  deployQueue: number
}

const key = '__harbormaster_state__'
if (!(globalThis as Record<string, unknown>)[key]) {
  ;(globalThis as Record<string, unknown>)[key] = new Map<string, AppState>()
}
const runtimeState = (globalThis as Record<string, unknown>)[key] as Map<
  string,
  AppState
>

function defaultState(): AppState {
  return {
    status: 'unknown',
    responseTimeMs: null,
    lastChecked: null,
    responseHistory: [],
    uptimePercent24h: null,
    containerState: null,
    lastDeployAt: null,
    lastDeployResult: null,
    lastCommitSha: null,
    lastCommitMessage: null,
    lastCommitAuthor: null,
    deployInProgress: false,
    deployQueue: 0,
  }
}

export function getState(appId: string): AppState {
  if (!runtimeState.has(appId)) {
    runtimeState.set(appId, defaultState())
  }
  return { ...runtimeState.get(appId)! }
}

export function updateState(
  appId: string,
  fields: Partial<AppState>,
): AppState {
  const current = runtimeState.get(appId) || defaultState()
  const updated = { ...current, ...fields }
  runtimeState.set(appId, updated)
  return updated
}

export function removeState(appId: string): void {
  runtimeState.delete(appId)
}

export function getAllStates(): Record<string, AppState> {
  const result: Record<string, AppState> = {}
  for (const [id, state] of runtimeState) {
    result[id] = { ...state }
  }
  return result
}
