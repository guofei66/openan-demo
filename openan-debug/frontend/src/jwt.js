import { getToken } from './api.js'

export function readJwtPayload() {
  try {
    const segment = getToken().split('.')[1] || ''
    const b64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
  } catch {
    return {}
  }
}
