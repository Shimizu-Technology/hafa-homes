const BROKERAGE_SLUG = process.env.EXPO_PUBLIC_BROKERAGE_SLUG ?? 'hafa-homes-demo'
let apiAvailable = true

export function setApiAvailability(available: boolean) {
  apiAvailable = available
}

export async function apiFetch(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}) {
  if (!apiAvailable) throw new Error('Hafa Homes is temporarily unavailable. Please check for updates.')
  const headers = new Headers(init.headers)
  headers.set('X-Brokerage-Slug', BROKERAGE_SLUG)

  return globalThis.fetch(input, {
    ...init,
    headers,
  })
}
