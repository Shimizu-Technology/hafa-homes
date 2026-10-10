import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, setApiAvailability } from './apiClient'

afterEach(() => { vi.unstubAllGlobals(); setApiAvailability(true) })

describe('paused API boundary', () => {
  it('blocks real API traffic while availability is unverified or paused', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    setApiAvailability(false)
    await expect(apiFetch('https://api.example.test/api/v1/listings')).rejects.toThrow('temporarily unavailable')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('restores requests with their auth and brokerage headers when available', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    setApiAvailability(true)
    await apiFetch('https://api.example.test/api/v1/me', { headers: { Authorization: 'Bearer test-fixture' } })
    const headers = fetcher.mock.calls[0][1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer test-fixture')
    expect(headers.get('X-Brokerage-Slug')).toBe('hafa-homes-demo')
  })
})
