import { describe, expect, it } from 'vitest'
import {
  advanceNavigationGeneration,
  agentRecordBackTarget,
  appLinkTarget,
  beginAppLinkNavigation,
  closeListingTransition,
  isCurrentNavigationGeneration,
  mergeAgentListingPage,
  openListingFromAgentTransition,
  requestDetailKey,
} from './navigation'

describe('appLinkTarget', () => {
  it('opens exact requests from both custom-scheme URL forms', () => {
    expect(appLinkTarget({ scheme: 'hafahomes', hostname: 'account', path: 'requests/42' })).toEqual({ type: 'request', requestId: 42 })
    expect(appLinkTarget({ scheme: 'hafahomes', hostname: null, path: 'account/requests/43' })).toEqual({ type: 'request', requestId: 43 })
  })

  it('opens exact records from Hafa Homes HTTPS universal links', () => {
    expect(appLinkTarget({ scheme: 'https', hostname: 'hafahomes.com', path: 'account/requests/43' })).toEqual({ type: 'request', requestId: 43 })
    expect(appLinkTarget({ scheme: 'https', hostname: 'hafahomes.com', path: 'listings/27' })).toEqual({ type: 'listing', listingId: 27 })
    expect(appLinkTarget({ scheme: 'https', hostname: 'hafahomes.com', path: 'agents/8' })).toEqual({ type: 'agent', agentId: 8 })
  })

  it('rejects record-looking HTTPS links from unassociated hosts', () => {
    expect(appLinkTarget({ scheme: 'https', hostname: 'example.com', path: 'account/requests/43' })).toEqual({ type: 'none' })
    expect(appLinkTarget({ scheme: 'http', hostname: 'hafahomes.com', path: 'account/requests/43' })).toEqual({ type: 'none' })
    expect(appLinkTarget({ scheme: 'mailto', hostname: null, path: 'account/requests/43' })).toEqual({ type: 'none' })
  })

  it('opens exact listings and rejects invalid record ids', () => {
    expect(appLinkTarget({ scheme: 'hafahomes', hostname: 'listings', path: '27' })).toEqual({ type: 'listing', listingId: 27 })
    expect(appLinkTarget({ scheme: 'hafahomes', hostname: 'listings', path: '0' })).toEqual({ type: 'none' })
  })

  it('opens exact agents from both custom-scheme URL forms before the directory route', () => {
    expect(appLinkTarget({ scheme: 'hafahomes', hostname: 'agents', path: '8' })).toEqual({ type: 'agent', agentId: 8 })
    expect(appLinkTarget({ scheme: 'hafahomes', hostname: null, path: 'agents/9' })).toEqual({ type: 'agent', agentId: 9 })
    expect(appLinkTarget({ scheme: 'hafahomes', hostname: 'agents', path: '0' })).toEqual({ type: 'none' })
  })

  it('keeps request history ahead of the broader account route', () => {
    expect(appLinkTarget({ scheme: 'hafahomes', hostname: 'account', path: 'requests' })).toEqual({ type: 'requests' })
    expect(appLinkTarget({ scheme: 'hafahomes', hostname: 'account', path: null })).toEqual({ type: 'more' })
  })
})

describe('navigation generation', () => {
  it('invalidates a pending asynchronous record after newer navigation', () => {
    const generation = { current: 0 }
    const pendingListing = advanceNavigationGeneration(generation)

    expect(isCurrentNavigationGeneration(generation, pendingListing)).toBe(true)

    advanceNavigationGeneration(generation)

    expect(isCurrentNavigationGeneration(generation, pendingListing)).toBe(false)
  })

  it('gives different request records different remount keys', () => {
    expect(requestDetailKey(42)).toBe('request-42')
    expect(requestDetailKey(43)).not.toBe(requestDetailKey(42))
  })

  it('dispatches initial and warm agent links while invalidating the older load', () => {
    const generation = { current: 0 }
    const initial = beginAppLinkNavigation(generation, { scheme: 'hafahomes', hostname: 'agents', path: '8' })
    const warm = beginAppLinkNavigation(generation, { scheme: 'hafahomes', hostname: 'agents', path: '9' })

    expect(initial.target).toEqual({ type: 'agent', agentId: 8 })
    expect(warm.target).toEqual({ type: 'agent', agentId: 9 })
    expect(isCurrentNavigationGeneration(generation, initial.generation)).toBe(false)
    expect(isCurrentNavigationGeneration(generation, warm.generation)).toBe(true)
  })
})

describe('agent record journeys', () => {
  it('merges bounded listing pages without duplicates and rejects another agent', () => {
    type AgentPage = { agent: { id: number }; attributed_listings: { id: number }[]; pagination: { next_page: number | null } }
    const first: AgentPage = { agent: { id: 8 }, attributed_listings: [{ id: 1 }, { id: 2 }], pagination: { next_page: 2 } }
    const second: AgentPage = { agent: { id: 8 }, attributed_listings: [{ id: 2 }, { id: 3 }], pagination: { next_page: null } }
    const anotherAgent: AgentPage = { agent: { id: 9 }, attributed_listings: [{ id: 4 }], pagination: { next_page: null } }

    expect(mergeAgentListingPage(first, second, 8)).toEqual({
      ...second,
      attributed_listings: [{ id: 1 }, { id: 2 }, { id: 3 }],
    })
    expect(mergeAgentListingPage(first, anotherAgent, 8)).toBe(first)
  })

  it('retains the exact listing only for listing-to-agent navigation', () => {
    const listing = { id: 27, title: 'Ocean view home' }

    expect(agentRecordBackTarget(listing)).toBe(listing)
    expect(agentRecordBackTarget(null)).toBeNull()
  })

  it('clears in-flight pagination when a listing opens before returning to the profile', () => {
    const listing = { id: 27, title: 'Ocean view home' }
    const agentProfile = { agentDetailId: 8, agentDetailLoading: true, listing: null }
    const openedListing = openListingFromAgentTransition(agentProfile, listing)
    const returnedProfile = closeListingTransition(openedListing)

    expect(agentProfile.agentDetailLoading).toBe(true)
    expect(openedListing).toEqual({ agentDetailId: 8, agentDetailLoading: false, listing })
    expect(returnedProfile).toEqual({ agentDetailId: 8, agentDetailLoading: false, listing: null })
  })
})
