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

  const fragmentIndex = path.indexOf('#')
  const target = fragmentIndex === -1 ? path : path.slice(0, fragmentIndex)
  const fragment = fragmentIndex === -1 ? '' : path.slice(fragmentIndex)
  const separator = target.includes('?') ? '&' : '?'
  return `${target}${separator}return_to=${encodeURIComponent(safeReturnTo)}${fragment}`
}

const routeId = (id: number | string) => encodeURIComponent(String(id))

export const routes = {
  home: () => '/',
  listing: (listingId: number | string, returnTo?: string | null) => withReturnTo(`/listings/${routeId(listingId)}`, returnTo),
  village: (slug: string, returnTo?: string | null) => withReturnTo(`/villages/${encodeURIComponent(slug)}`, returnTo),
  agent: (agentId: number | string, returnTo?: string | null) => withReturnTo(`/agents/${routeId(agentId)}`, returnTo),
  requests: () => '/account/requests',
  request: (requestId: number | string, returnTo?: string | null) => withReturnTo(`/account/requests/${routeId(requestId)}`, returnTo),
  adminLeads: (params?: URLSearchParams | string) => {
    const query = typeof params === 'string' ? params : params?.toString()
    return `/admin/leads${query ? `?${query}` : ''}`
  },
  adminLead: (leadId: number | string, returnTo?: string | null) => withReturnTo(`/admin/leads/${routeId(leadId)}`, returnTo),
  adminCustomer: (brokerageId: number | string, userId: number | string, returnTo?: string | null) => withReturnTo(`/admin/brokerages/${routeId(brokerageId)}/customers/${routeId(userId)}`, returnTo),
  adminShowing: (showingId: number | string, returnTo?: string | null) => withReturnTo(`/admin/showings/${routeId(showingId)}`, returnTo),
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
