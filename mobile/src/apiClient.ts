const BROKERAGE_SLUG = process.env.EXPO_PUBLIC_BROKERAGE_SLUG ?? 'hafa-homes-demo'

export function apiFetch(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}) {
  return globalThis.fetch(input, {
    ...init,
    headers: {
      'X-Brokerage-Slug': BROKERAGE_SLUG,
      ...((init?.headers || {}) as Record<string, string>),
    },
  })
}
