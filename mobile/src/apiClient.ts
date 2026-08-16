const BROKERAGE_SLUG = process.env.EXPO_PUBLIC_BROKERAGE_SLUG ?? 'hafa-homes-demo'

export function apiFetch(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}) {
  const headers = new Headers(init.headers)
  headers.set('X-Brokerage-Slug', BROKERAGE_SLUG)

  return globalThis.fetch(input, {
    ...init,
    headers,
  })
}
