import { afterEach, describe, expect, it, vi } from 'vitest'
import { readServiceAvailability, SERVICE_STATUS_URL, STATUS_TIMEOUT_MS } from './serviceAvailability'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('static service availability', () => {
  it('ignores a fixture URL in production bundles', async () => {
    vi.stubGlobal('__DEV__', false)
    vi.stubEnv('EXPO_PUBLIC_SERVICE_STATUS_URL', 'http://127.0.0.1:39094/status')
    vi.resetModules()
    const production = await import('./serviceAvailability')
    expect(production.SERVICE_STATUS_URL).toBe('https://hafahomes.com/service-status.json')
  })
  it.each(['paused', 'available'])('accepts only the explicit %s state from the CDN', async (state) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state })))
    expect(await readServiceAvailability(undefined, fetcher)).toBe(state)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][0]).toBe(SERVICE_STATUS_URL)
    expect(fetcher.mock.calls[0][1].cache).toBe('no-store')
  })
  it.each(['unknown', '', 'AVAILABLE'])('rejects invalid state %j', async (state) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state })))
    await expect(readServiceAvailability(undefined, fetcher)).rejects.toThrow('Invalid availability')
  })
  it('rejects a failed status response', async () => {
    await expect(readServiceAvailability(undefined, vi.fn().mockResolvedValue(new Response('', { status: 503 })))).rejects.toThrow('Availability check failed')
  })
  it('times out even if the transport ignores cancellation', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}))
    const result = readServiceAvailability(undefined, fetcher)
    const assertion = expect(result).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS)
    await assertion
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true)
  })
  it('cancels superseded checks without waiting for the timeout', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}))
    const result = readServiceAvailability(controller.signal, fetcher)
    controller.abort()
    await expect(result).rejects.toThrow('cancelled')
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true)
  })
})
