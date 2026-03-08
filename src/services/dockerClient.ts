import http from 'http'

const SOCKET_PATH = '/var/run/docker.sock'

interface DockerResponse {
  status: number
  data: unknown
}

function dockerRequest(method: string, reqPath: string): Promise<DockerResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: SOCKET_PATH, path: reqPath, method },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(data) })
          } catch {
            resolve({ status: res.statusCode || 0, data })
          }
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

export async function getContainerState(appId: string): Promise<string> {
  try {
    const { status, data } = await dockerRequest(
      'GET',
      `/containers/${appId}/json`,
    )
    if (status === 200 && data && typeof data === 'object') {
      return (data as Record<string, Record<string, string>>).State?.Status || 'unknown'
    }
    return 'not-found'
  } catch {
    return 'error'
  }
}

export async function restartContainer(appId: string): Promise<boolean> {
  try {
    const { status } = await dockerRequest(
      'POST',
      `/containers/${appId}/restart?t=10`,
    )
    return status === 204 || status === 200
  } catch {
    return false
  }
}

interface DockerContainer {
  Names?: string[]
  Ports?: Array<{ PublicPort?: number }>
}

export async function listContainers(): Promise<DockerContainer[]> {
  try {
    const { status, data } = await dockerRequest('GET', '/containers/json')
    if (status === 200 && Array.isArray(data)) {
      return data
    }
    return []
  } catch {
    return []
  }
}
