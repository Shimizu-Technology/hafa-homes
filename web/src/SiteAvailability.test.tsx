// @vitest-environment jsdom
import { useEffect } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteAvailability } from './SiteAvailability'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); window.history.replaceState(null, '', '/') })

function BackendApp() {
  useEffect(() => { void fetch('https://api.example.test/api/v1/listings') }, [])
  return <p>Home search is ready</p>
}

function response(state: string) { return new Response(JSON.stringify({ state })) }

describe('site availability before app startup', () => {
  it('shows the pause and account support without mounting the API app', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('paused'))
    vi.stubGlobal('fetch', fetcher)
    render(<SiteAvailability><BackendApp /></SiteAvailability>)
    await screen.findByRole('heading', { name: 'We’re working on Hafa Homes.' })
    expect(screen.queryByText('Home search is ready')).toBeNull()
    expect(screen.getByRole('link', { name: 'shimizutechnology@gmail.com' }).getAttribute('href')).toContain('mailto:shimizutechnology@gmail.com')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toBe('/service-status.json')
    expect(fetcher.mock.calls[0][1].cache).toBe('no-store')
  })

  it('mounts the unchanged app only when the static status explicitly allows it', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response('available')).mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    render(<SiteAvailability><BackendApp /></SiteAvailability>)
    await screen.findByText('Home search is ready')
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/api/v1/listings')
  })

  it('keeps the existing privacy policy available during the pause without API access', async () => {
    window.history.replaceState(null, '', '/privacy')
    const fetcher = vi.fn().mockResolvedValue(response('paused'))
    vi.stubGlobal('fetch', fetcher)
    render(<SiteAvailability><BackendApp /></SiteAvailability>)
    await screen.findByRole('heading', { name: 'Hafa Homes privacy policy' })
    expect(screen.getByText('Information we collect.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Hafa Homes' }).getAttribute('href')).toBe('/')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each(['unknown', '', 'AVAILABLE'])('fails closed for invalid status %j', async (state) => {
    const fetcher = vi.fn().mockResolvedValue(response(state))
    vi.stubGlobal('fetch', fetcher)
    render(<SiteAvailability><BackendApp /></SiteAvailability>)
    await screen.findByRole('heading', { name: 'Hafa Homes is temporarily unavailable.' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('fails closed for HTTP errors and retries only the static status on demand', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(response('paused'))
    vi.stubGlobal('fetch', fetcher)
    render(<SiteAvailability><BackendApp /></SiteAvailability>)
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'We’re working on Hafa Homes.' })
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual(['/service-status.json', '/service-status.json'])
  })

  it('stops waiting after five seconds without starting the API app', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetcher)
    render(<SiteAvailability><BackendApp /></SiteAvailability>)
    await vi.advanceTimersByTimeAsync(5000)
    vi.useRealTimers()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hafa Homes is temporarily unavailable.'))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
