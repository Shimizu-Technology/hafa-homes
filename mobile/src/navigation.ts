export type ParsedAppLink = {
  scheme?: string | null
  hostname?: string | null
  path?: string | null
}

export type AppLinkTarget =
  | { type: 'request'; requestId: number }
  | { type: 'listing'; listingId: number }
  | { type: 'agents' | 'requests' | 'saved' | 'more' }
  | { type: 'none' }

function positiveId(value: string) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function appLinkTarget(parsed: ParsedAppLink): AppLinkTarget {
  const pathParts = [parsed.scheme === 'hafahomes' ? parsed.hostname : null, parsed.path]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
  const path = `/${pathParts.join('/')}`
  const exactRequest = path.match(/^\/(?:account\/)?requests\/(\d+)\/?$/)
  const exactListing = path.match(/^\/listings\/(\d+)\/?$/)

  if (exactRequest) {
    const requestId = positiveId(exactRequest[1])
    return requestId ? { type: 'request', requestId } : { type: 'none' }
  }

  if (exactListing) {
    const listingId = positiveId(exactListing[1])
    return listingId ? { type: 'listing', listingId } : { type: 'none' }
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

export function isCurrentNavigationGeneration(generation: { current: number }, candidate: number) {
  return generation.current === candidate
}

export function requestDetailKey(requestId: number) {
  return `request-${requestId}`
}
