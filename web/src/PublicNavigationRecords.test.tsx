// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ListingDetailPage, SearchPage, VillageDetailPage } from './App'

vi.mock('./contexts/AuthContext', () => ({
  useAuthContext: () => ({ isClerkEnabled: false, isSignedIn: false, isLoading: false, userId: null }),
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

const village = {
  id: 4,
  name: 'Yigo',
  slug: 'yigo',
  region: 'north',
  description: 'Northern Guam homes and local context.',
  active_listings_count: 1,
  local_intel: { summary: 'Close to Andersen.' },
}

const listing = {
  id: 27,
  title: 'Yigo rental',
  address: '130 Charles Flores Street',
  listing_kind: 'rent',
  property_type: 'house',
  status: 'active',
  price: 2700,
  beds: 3,
  baths: 2,
  square_feet: 1800,
  latitude: 13.53,
  longitude: 144.89,
  primary_photo_url: 'https://images.example.test/27.jpg',
  village,
  features: [],
  brokerage: { id: 2, name: 'Alpha Realty', slug: 'alpha' },
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

function renderRoute(element: React.ReactNode, initialEntry: string, path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <Routes><Route path={path} element={element} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('public search return context', () => {
  it('writes the device-appropriate default view into the URL when it is absent', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/api/v1/listings') ? response({ listings: [] }) : response({ villages: [] })))

    renderRoute(<SearchPage />, '/?kind=sale', '/')

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/?kind=sale&view=map'))
  })

  it('keeps filters and list/map mode in the URL and every listing destination', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/listings')) return response({ listings: [listing] })
      if (url.endsWith('/api/v1/villages')) return response({ villages: [village] })
      return response({})
    }))

    renderRoute(<SearchPage />, '/?kind=rent&view=list&village=yigo', '/')

    const titleLink = (await screen.findAllByRole('link', { name: 'Yigo rental' }))[0]
    expect(titleLink.getAttribute('href')).toBe('/listings/27?return_to=%2F%3Fkind%3Drent%26view%3Dlist%26village%3Dyigo')

    fireEvent.click(screen.getByRole('button', { name: 'Map view' }))

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/?kind=rent&view=map&village=yigo'))
    const mapListingLink = screen.getAllByRole('link').find((link) => link.getAttribute('href')?.startsWith('/listings/27?return_to='))
    expect(mapListingLink?.getAttribute('href')).toBe('/listings/27?return_to=%2F%3Fkind%3Drent%26view%3Dmap%26village%3Dyigo')
  })
})

describe('village record journeys', () => {
  it('loads the exact village API record and preserves nested listing returns', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/villages/yigo')) return response({ village })
      if (url.includes('/api/v1/listings?village=yigo')) return response({ listings: [listing] })
      return response({})
    })
    vi.stubGlobal('fetch', fetchMock)

    renderRoute(<VillageDetailPage />, '/villages/yigo?return_to=%2Flistings%2F19', '/villages/:slug')

    expect(await screen.findByRole('heading', { name: 'Yigo', level: 1 })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to listing' }).getAttribute('href')).toBe('/listings/19')
    expect((await screen.findByRole('link', { name: 'View details' })).getAttribute('href')).toBe('/listings/27?return_to=%2Fvillages%2Fyigo%3Freturn_to%3D%252Flistings%252F19')
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/v1/villages/yigo'))).toBe(true)
  })

  it('renders an explicit unavailable state for an unknown slug', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'Not found' }, 404)))

    renderRoute(<VillageDetailPage />, '/villages/not-a-village', '/villages/:slug')

    expect(await screen.findByText('This village is not available.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Guam village' })).toBeNull()
  })

  it('links a listing back to its village while preserving the listing origin', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/listings/27')) return response({ listing })
      if (url.endsWith('/api/v1/agents')) return response({ agents: [] })
      return response({})
    }))

    renderRoute(<ListingDetailPage />, '/listings/27?return_to=%2F%3Fkind%3Drent%26view%3Dmap', '/listings/:id')

    const villageLinks = await screen.findAllByRole('link', { name: /Yigo/ })
    expect(villageLinks.some((link) => link.getAttribute('href') === '/villages/yigo?return_to=%2Flistings%2F27%3Freturn_to%3D%252F%253Fkind%253Drent%2526view%253Dmap')).toBe(true)
  })
})
