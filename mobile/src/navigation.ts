export type ParsedAppLink = {
  scheme?: string | null
  hostname?: string | null
  path?: string | null
}

export type AppLinkTarget =
  | { type: 'request'; requestId: number }
  | { type: 'listing'; listingId: number }
  | { type: 'agent'; agentId: number }
  | { type: 'agents' | 'requests' | 'saved' | 'more' }
  | { type: 'none' }

const HTTPS_APP_HOSTS = new Set(['hafahomes.com'])

function positiveId(value: string) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function appLinkTarget(parsed: ParsedAppLink): AppLinkTarget {
  if (parsed.scheme === 'https' && !HTTPS_APP_HOSTS.has(parsed.hostname?.toLowerCase() || '')) {
    return { type: 'none' }
  }
  if (parsed.scheme !== 'https' && parsed.scheme !== 'hafahomes') {
    return { type: 'none' }
  }

  const pathParts = [parsed.scheme === 'hafahomes' ? parsed.hostname : null, parsed.path]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
  const path = `/${pathParts.join('/')}`
  const exactRequest = path.match(/^\/(?:account\/)?requests\/(\d+)\/?$/)
  const exactListing = path.match(/^\/listings\/(\d+)\/?$/)
  const exactAgent = path.match(/^\/agents\/(\d+)\/?$/)

  if (exactRequest) {
    const requestId = positiveId(exactRequest[1])
    return requestId ? { type: 'request', requestId } : { type: 'none' }
  }

  if (exactListing) {
    const listingId = positiveId(exactListing[1])
    return listingId ? { type: 'listing', listingId } : { type: 'none' }
  }

  if (exactAgent) {
    const agentId = positiveId(exactAgent[1])
    return agentId ? { type: 'agent', agentId } : { type: 'none' }
  }

  if (path.startsWith('/agents')) return { type: 'agents' }
  if (path.startsWith('/account/requests') || path.startsWith('/requests')) return { type: 'requests' }
  if (path.startsWith('/saved')) return { type: 'saved' }
  if (path.startsWith('/account')) return { type: 'more' }
  return { type: 'none' }
}

export function advanceNavigationGeneration(generation: { current: number }) {
  generation.current += 1
  return generation.current
}

export function beginAppLinkNavigation(generation: { current: number }, parsed: ParsedAppLink) {
  return {
    generation: advanceNavigationGeneration(generation),
    target: appLinkTarget(parsed),
  }
}

export function isCurrentNavigationGeneration(generation: { current: number }, candidate: number) {
  return generation.current === candidate
}

export function requestDetailKey(requestId: number) {
  return `request-${requestId}`
}

export function mergeAgentListingPage<
  TListing extends { id: number },
  TRecord extends { agent: { id: number }; attributed_listings: TListing[] },
>(current: TRecord | null, next: TRecord, expectedAgentId: number): TRecord | null {
  if (!current || current.agent.id !== expectedAgentId || next.agent.id !== expectedAgentId) return current

  const seen = new Set(current.attributed_listings.map((listing) => listing.id))
  return {
    ...next,
    attributed_listings: [
      ...current.attributed_listings,
      ...next.attributed_listings.filter((listing) => !seen.has(listing.id)),
    ],
  }
}

export function agentRecordBackTarget<T>(returnListing: T | null) {
  return returnListing
}

export type AgentListingTransitionState<T> = {
  agentDetailId: number | null
  agentDetailLoading: boolean
  listing: T | null
}

export function openListingFromAgentTransition<T>(state: AgentListingTransitionState<T>, listing: T): AgentListingTransitionState<T> {
  return {
    ...state,
    agentDetailLoading: false,
    listing,
  }
}

export function closeListingTransition<T>(state: AgentListingTransitionState<T>): AgentListingTransitionState<T> {
  return { ...state, listing: null }
}
