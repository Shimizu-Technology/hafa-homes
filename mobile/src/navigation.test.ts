import { describe, expect, it } from 'vitest'
import {
  advanceNavigationGeneration,
  appLinkTarget,
  isCurrentNavigationGeneration,
  requestDetailKey,
} from './navigation'

describe('appLinkTarget', () => {
  it('opens exact requests from both custom-scheme URL forms', () => {
    expect(appLinkTarget({ scheme: 'hafahomes', hostname: 'account', path: 'requests/42' })).toEqual({ type: 'request', requestId: 42 })
    expect(appLinkTarget({ scheme: 'hafahomes', hostname: null, path: 'account/requests/43' })).toEqual({ type: 'request', requestId: 43 })
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
})
