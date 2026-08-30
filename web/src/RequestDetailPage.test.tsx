// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RequestDetailPage } from './App'

const auth = vi.hoisted(() => ({
  state: {
    isClerkEnabled: true,
    isSignedIn: true,
    isLoading: false,
    userId: 'consumer_42' as string | null,
  },
}))

vi.mock('./contexts/AuthContext', () => ({
  useAuthContext: () => auth.state,
}))

vi.mock('./components/AuthControls', () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: () => null,
  UserButton: () => null,
}))

vi.mock('./components/Brand', () => ({
  Brand: () => <span>Hafa Homes</span>,
}))

const request = {
  id: 42,
  lead_type: 'showing_request',
  name: 'Test Consumer',
  email: 'consumer@example.test',
  status: 'showing_scheduled',
  created_at: '2026-08-30T23:00:00Z',
  consumer_status_label: 'Showing scheduled',
  listing: {
    id: 27,
    title: 'Large northern Yigo home',
    address: '130 Charles Flores',
    price: 775000,
    listing_kind: 'sale',
    village: 'Yigo',
  },
  brokerage: { id: 2, name: 'Hafa Homes Demo Brokerage', slug: 'hafa-homes-demo' },
  showing_appointments: [{
    id: 9,
    lead_id: 42,
    scheduled_starts_at: '2026-08-31T00:00:00Z',
    timezone: 'Pacific/Honolulu',
    tour_type: 'in_person',
    status: 'confirmed',
    created_at: '2026-08-30T22:00:00Z',
  }],
}

function renderRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/account/requests/42?return_to=%2Faccount%2Frequests%3Fpage%3D2']}>
        <Routes>
          <Route path="/account/requests/:id" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  auth.state = { isClerkEnabled: true, isSignedIn: true, isLoading: false, userId: 'consumer_42' }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RequestDetailPage route states', () => {
  it('requires authentication before loading a private request', () => {
    auth.state = { isClerkEnabled: false, isSignedIn: false, isLoading: false, userId: null }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderRoute()

    expect(screen.getByText('Sign in to view this request.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retrieves and renders the exact request with its appointment timezone', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/me/leads/42')) return response({ lead: request })
      if (url.endsWith('/api/v1/me')) return response({ user: { is_staff: false } })
      return response({ error: 'Not found' }, 404)
    }))

    renderRoute()

    expect(await screen.findByText('Request HH-42')).toBeTruthy()
    expect(screen.getByText('Aug 30, 2:00 PM')).toBeTruthy()
    expect(screen.getByText('in person · Pacific/Honolulu')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to requests' }).getAttribute('href')).toBe('/account/requests?page=2')
  })

  it('renders the storefront-scoped unavailable state for a 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/me/leads/42')) return response({ error: 'Not found' }, 404)
      return response({ user: { is_staff: false } })
    }))

    renderRoute()

    expect(await screen.findByText('This request is not available in this brokerage storefront.')).toBeTruthy()
  })

  it('renders the API error without presenting it as a missing request', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/me/leads/42')) return response({ error: 'Brokerage API unavailable' }, 503)
      return response({ user: { is_staff: false } })
    }))

    renderRoute()

    expect(await screen.findByText('Brokerage API unavailable')).toBeTruthy()
  })
})
