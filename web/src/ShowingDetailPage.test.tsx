// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ShowingDetailPage } from './App'
import App from './App'
import { datetimeLocalValue, zonedDateTimeToIso } from './lib/dateTime'

vi.mock('./contexts/AuthContext', () => ({
  useAuthContext: () => ({ isClerkEnabled: true, isSignedIn: true, isLoading: false, userId: 'staff_7' }),
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

const showing = {
  id: 81,
  lead_id: 42,
  listing_id: 27,
  scheduled_starts_at: '2026-08-31T00:00:00Z',
  scheduled_ends_at: '2026-08-31T01:30:00Z',
  timezone: 'Pacific/Honolulu',
  tour_type: 'in_person',
  status: 'confirmed',
  location: 'Meet at the front gate',
  consumer_notes: 'Please bring photo identification.',
  internal_notes: 'Call security before arrival.',
  created_at: '2026-08-30T22:00:00Z',
  lead: {
    id: 42,
    lead_type: 'showing_request',
    name: 'Test Consumer',
    email: 'consumer@example.test',
    phone: '+16715550123',
    status: 'showing_scheduled',
  },
  listing: {
    id: 27,
    title: 'Large northern Yigo home',
    address: '130 Charles Flores',
    village: 'Yigo',
    listing_kind: 'sale',
  },
  brokerage: { id: 2, name: 'Hafa Homes Demo Brokerage', slug: 'hafa-homes-demo' },
  agent: { id: 3, name: 'Mina Agent', email: 'mina@example.test' },
  created_by: { id: 7, full_name: 'Bea Broker', email: 'bea@example.test', role: 'brokerage_admin' },
}

function renderRoute() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/showings/81?return_to=%2Fadmin%2Fshowings%3Fpage%3D3']}>
        <Routes>
          <Route path="/admin/showings/:id" element={<ShowingDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ShowingDetailPage route states', () => {
  it('preserves the saved appointment timezone in datetime-local values', () => {
    expect(datetimeLocalValue('2026-08-31T00:00:00Z', 'Pacific/Honolulu')).toBe('2026-08-30T14:00')
    expect(zonedDateTimeToIso('2026-08-30T14:00', 'Pacific/Honolulu')).toBe('2026-08-31T00:00:00.000Z')
    expect(zonedDateTimeToIso('2026-09-01T20:00', 'Pacific/Guam')).toBe('2026-09-01T10:00:00.000Z')
  })

  it('renders the exact showing with timezone and reciprocal record links', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/v1/showing_appointments/81')) return response({ showing_appointment: showing })
      return response({ error: 'Not found' }, 404)
    }))

    renderRoute()

    expect(await screen.findByText('Showing #81')).toBeTruthy()
    expect(screen.getAllByText('Aug 30, 2:00 PM').length).toBeGreaterThan(0)
    expect(screen.getByText('Call security before arrival.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to showing schedule' }).getAttribute('href')).toBe('/admin/showings?page=3')
    expect(screen.getByRole('link', { name: 'Open lead workspace' }).getAttribute('href')).toBe('/admin/leads/42?return_to=%2Fadmin%2Fshowings%2F81%3Freturn_to%3D%252Fadmin%252Fshowings%253Fpage%253D3')
    expect(screen.getByRole('link', { name: 'Open listing' }).getAttribute('href')).toBe('/listings/27?return_to=%2Fadmin%2Fshowings%2F81%3Freturn_to%3D%252Fadmin%252Fshowings%253Fpage%253D3')
  })

  it('labels the reciprocal listing return for a staff showing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/listings/27')) return response({ listing: {
        id: 27,
        title: 'Large northern Yigo home',
        address: '130 Charles Flores',
        price: 775000,
        listing_kind: 'sale',
        property_type: 'home',
        status: 'active',
        bedrooms: 6,
        bathrooms: 4.5,
        square_feet: 3400,
        description: 'Test listing',
        village: { id: 4, name: 'Yigo', slug: 'yigo', region: 'north' },
        features: [],
        photos: [],
      } })
      if (url.includes('/api/v1/agents')) return response({ agents: [] })
      if (url.endsWith('/api/v1/me')) return response({ user: { is_staff: true } })
      return response({ error: 'Not found' }, 404)
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/listings/27?return_to=%2Fadmin%2Fshowings%2F81']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('link', { name: 'Back to showing' })).toBeTruthy()
  })

  it('renders a scoped unavailable state for a 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'Not found' }, 404)))

    renderRoute()

    expect(await screen.findByText('This showing is not available in your staff workspace.')).toBeTruthy()
  })

  it('renders an API failure without presenting it as a missing record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'Showing service unavailable' }, 503)))

    renderRoute()

    expect(await screen.findByText('Showing service unavailable')).toBeTruthy()
  })
})
