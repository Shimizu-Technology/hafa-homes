let authTokenGetter: (() => Promise<string | null>) | null = null

export function setAuthTokenGetter(getter: (() => Promise<string | null>) | null) {
  authTokenGetter = getter
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (!authTokenGetter) return {}
  const token = await authTokenGetter()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function brokerageHeaders(headers?: HeadersInit, hostname = typeof window === 'undefined' ? '' : window.location.hostname) {
  const nextHeaders = new Headers(headers)
  if (hostname && !nextHeaders.has('X-Brokerage-Host')) nextHeaders.set('X-Brokerage-Host', hostname)
  return nextHeaders
}

export function apiFetch(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}) {
  return globalThis.fetch(input, {
    ...init,
    headers: brokerageHeaders(init?.headers),
  })
}
