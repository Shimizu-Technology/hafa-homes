const INTERNAL_PATH = /^\/(?!\/)/

export function safeInternalPath(path: string | null | undefined, fallback = '/') {
  if (!path || !INTERNAL_PATH.test(path)) return fallback

  try {
    const parsed = new URL(path, 'https://hafahomes.local')
    if (parsed.origin !== 'https://hafahomes.local') return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

export function withReturnTo(path: string, returnTo?: string | null) {
  const safeReturnTo = safeInternalPath(returnTo, '')
  if (!safeReturnTo) return path

  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}return_to=${encodeURIComponent(safeReturnTo)}`
}

export const routes = {
  home: () => '/',
  listing: (listingId: number | string, returnTo?: string | null) => withReturnTo(`/listings/${listingId}`, returnTo),
  village: (slug: string, returnTo?: string | null) => withReturnTo(`/villages/${encodeURIComponent(slug)}`, returnTo),
  agent: (agentId: number | string, returnTo?: string | null) => withReturnTo(`/agents/${agentId}`, returnTo),
  requests: () => '/account/requests',
  request: (requestId: number | string, returnTo?: string | null) => withReturnTo(`/account/requests/${requestId}`, returnTo),
  adminLead: (leadId: number | string, returnTo?: string | null) => withReturnTo(`/admin/leads/${leadId}`, returnTo),
  adminShowing: (showingId: number | string, returnTo?: string | null) => withReturnTo(`/admin/showings/${showingId}`, returnTo),
}

const PRIVATE_ANALYTICS_PREFIXES = [ '/admin', '/account', '/requests', '/sign-in', '/sign-up' ]

export function publicAnalyticsPath(pathname: string) {
  const normalized = safeInternalPath(pathname).split(/[?#]/, 1)[0]
  if (PRIVATE_ANALYTICS_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) return null
  if (/^\/listings\/\d+$/.test(normalized)) return '/listings/:id'
  if (/^\/villages\/[^/]+$/.test(normalized)) return '/villages/:slug'
  if (/^\/agents\/\d+$/.test(normalized)) return '/agents/:id'
  return normalized
}
