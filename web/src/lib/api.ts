let authTokenGetter: (() => Promise<string | null>) | null = null

export function setAuthTokenGetter(getter: (() => Promise<string | null>) | null) {
  authTokenGetter = getter
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (!authTokenGetter) return {}
  const token = await authTokenGetter()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
